/* Derived statistical charts.  This module intentionally does not depend on GraphCore. */
(function(root,factory){
  const api=factory(root);
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.GraphCharts=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(root){
  'use strict';
  const Tables=typeof module==='object'&&module.exports?require('./tables.js'):root.GraphTables;
  const Statistics=typeof module==='object'&&module.exports?require('./statistics.js'):root.GraphStatistics;
  const Analysis=typeof module==='object'&&module.exports?require('./analysis.js'):root.GraphAnalysis;
  const kinds=['residual','scatter','histogram','box'];
  const models=['linear','proportional','quadratic','exponential','power'];
  let sequence=0;
  const finite=value=>typeof value==='number'&&Number.isFinite(value);
  const format=value=>String(Number(value.toPrecision(8)));
  const own=(object,key)=>Object.prototype.hasOwnProperty.call(object,key);
  const escape=value=>String(value==null?'':value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const fail=message=>{throw new Error(message);};
  const clone=value=>JSON.parse(JSON.stringify(value));
  function id(){sequence++;return 'chart_'+Date.now().toString(36)+'_'+sequence.toString(36);}
  function create(kind,options={}){
    if(!kinds.includes(kind))fail('グラフの種類が不正です。');
    if(!options||typeof options!=='object'||Array.isArray(options))fail('グラフの設定が不正です。');
    const generatedId=id(),base={id:generatedId,kind,name:'',color:'#2563eb'};
    if(kind==='residual')Object.assign(base,{regressionId:'',horizontal:'x'});
    if(kind==='scatter')Object.assign(base,{seriesId:'',xColumn:0,yColumn:1,model:null});
    if(kind==='histogram')Object.assign(base,{seriesId:'',column:0,bins:null});
    if(kind==='box')Object.assign(base,{seriesId:'',columns:[0]});
    // IDs are generated here; callers may choose presentation settings but not
    // a colliding persistent identity.
    return Object.assign(base,clone(options),{id:generatedId,kind});
  }
  function documentIds(doc){
    const ids=new Set(['main','comparison']);
    for(const item of [].concat(doc&&doc.series||[],doc&&doc.annotations||[]))if(item&&typeof item.id==='string')ids.add(item.id);
    return ids;
  }
  function series(doc,id){return (doc&&Array.isArray(doc.series)?doc.series:[]).find(item=>item&&item.id===id);}
  function annotation(doc,id){return (doc&&Array.isArray(doc.annotations)?doc.annotations:[]).find(item=>item&&item.id===id);}
  function text(value,label,max=160){if(typeof value!=='string'||value.length>max||/[\u0000-\u001f]/.test(value))fail(label+'が不正です。');return value;}
  function chartId(value,used,reserved){if(typeof value!=='string'||!/^[A-Za-z0-9_-]{1,100}$/.test(value)||used.has(value)||reserved.has(value))fail('グラフのIDが不正または重複しています。');used.add(value);return value;}
  function index(value,label){if(!Number.isInteger(value)||value<0||value>=20)fail(label+'が不正です。');return value;}
  function sourceId(value,label){if(typeof value!=='string'||!value)fail(label+'が不正です。');return value;}
  function validateOne(raw,doc,used,reserved){
    if(!raw||typeof raw!=='object'||Array.isArray(raw)||!kinds.includes(raw.kind))fail('グラフの設定が不正です。');
    if(typeof raw.color!=='string'||!/^#[0-9a-fA-F]{6}$/.test(raw.color))fail('グラフの色が不正です。');
    const out={id:chartId(raw.id,used,reserved),kind:raw.kind,name:text(raw.name??'','グラフ名',160),color:raw.color};
    if(raw.kind==='residual'){
      out.regressionId=sourceId(raw.regressionId,'回帰参照');
      if(!annotation(doc,out.regressionId)||annotation(doc,out.regressionId).kind!=='regression')fail('残差グラフの回帰参照が見つかりません。');
      if(!['x','predicted'].includes(raw.horizontal))fail('残差グラフの横軸が不正です。');out.horizontal=raw.horizontal;
    }else{
      out.seriesId=sourceId(raw.seriesId,'数表参照');
      const source=series(doc,out.seriesId);
      if(!source||!['data2d','data3d'].includes(source.kind))fail('数表参照が見つかりません。');
      const table=Tables.fromSeries(source),hasColumn=value=>value<table.columns.length;
      if(raw.kind==='scatter'){out.xColumn=index(raw.xColumn,'横軸の列');out.yColumn=index(raw.yColumn,'縦軸の列');if(!hasColumn(out.xColumn)||!hasColumn(out.yColumn))fail('散布図の列が数表にありません。');if(out.xColumn===out.yColumn)fail('散布図には異なる2列を指定してください。');if(raw.model!==null&&!models.includes(raw.model))fail('回帰モデルが不正です。');out.model=raw.model;}
      else if(raw.kind==='histogram'){out.column=index(raw.column,'ヒストグラムの列');if(!hasColumn(out.column))fail('ヒストグラムの列が数表にありません。');if(raw.bins!==null&&(!Number.isInteger(raw.bins)||raw.bins<1||raw.bins>100))fail('階級数は1〜100または自動にしてください。');out.bins=raw.bins;}
      else {if(!Array.isArray(raw.columns)||raw.columns.length<1||raw.columns.length>20)fail('箱ひげ図の列を1〜20列指定してください。');out.columns=raw.columns.map(value=>index(value,'箱ひげ図の列'));if(out.columns.some(value=>!hasColumn(value)))fail('箱ひげ図の列が数表にありません。');if(new Set(out.columns).size!==out.columns.length)fail('箱ひげ図の列が重複しています。');}
    }
    return out;
  }
  function validate(charts,doc){
    if(!Array.isArray(charts)||charts.length>12)fail('グラフは12個以下にしてください。');
    const used=new Set(),reserved=documentIds(doc);
    return charts.map(chart=>validateOne(chart,doc,used,reserved));
  }
  function prune(charts,doc){
    if(!Array.isArray(charts))return [];
    const seriesIds=new Set((doc&&doc.series||[]).map(item=>item&&item.id));
    const regressionIds=new Set((doc&&doc.annotations||[]).filter(item=>item&&item.kind==='regression').map(item=>item.id));
    return charts.filter(chart=>chart&&typeof chart==='object'&&(chart.kind==='residual'?regressionIds.has(chart.regressionId):seriesIds.has(chart.seriesId)));
  }
  function tableFor(doc,seriesId){const source=series(doc,seriesId);if(!source)fail('数表参照が見つかりません。');return {source,table:Tables.fromSeries(source)};}
  function validColumn(table,column){return Number.isInteger(column)&&column>=0&&column<table.columns.length;}
  function title(chart,fallback){return escape(chart.name||fallback);}
  function baseLayout(chart,titleText,dark,fontSize){const grid=dark?'#374151':'#d1d5db',color=dark?'#e5e7eb':'#1f2937';return {title:{text:title(chart,titleText),font:{size:fontSize+2}},font:{size:fontSize,color},paper_bgcolor:dark?'#111827':'#ffffff',plot_bgcolor:dark?'#111827':'#ffffff',margin:{l:64,r:28,t:56,b:100},legend:{orientation:'h',x:0,y:0,yref:'container',xanchor:'left',yanchor:'bottom'},xaxis:{automargin:true,gridcolor:grid,zerolinecolor:color,tickfont:{color},title:{font:{color}}},yaxis:{automargin:true,gridcolor:grid,zerolinecolor:color,tickfont:{color},title:{font:{color}}}};}
  function axisText(doc,key,fallback){const axis=doc&&doc.axes&&doc.axes[key]||{},symbol=axis.symbol||fallback,label=axis.label||'',unit=axis.unit||'';return String(symbol)+(label&&label!==symbol?'（'+label+'）':'')+(unit?' ['+unit+']':'');}
  function empty(chart,message,dark,fontSize,axes={}){const layout=baseLayout(chart,'統計グラフ',dark,fontSize);layout.xaxis.title={text:escape(axes.x||'値')};layout.yaxis.title={text:escape(axes.y||'値')};layout.annotations=[{text:escape(message),showarrow:false,font:{color:dark?'#e5e7eb':'#1f2937'}}];return {data:[],layout,summary:'',warnings:[message]};}
  function buildResidual(chart,doc,dark,fontSize){
    const regression=annotation(doc,chart.regressionId),source=regression&&series(doc,regression.seriesId);
    const xAxis=axisText(doc,'x','x'),yAxis=axisText(doc,'y','y');
    if(!regression||!source)return empty(chart,'参照する回帰が見つかりません。',dark,fontSize,{x:xAxis,y:yAxis+' の残差'});
    const fit=Analysis.fit(source,regression.model);
    if(fit.warning)return empty(chart,fit.warning,dark,fontSize,{x:xAxis,y:yAxis+' の残差'});
    const horizontal=chart.horizontal==='predicted'?yAxis+' の予測値':xAxis;
    const trace={type:'scatter',mode:'markers',name:title(chart,'残差'),x:fit.residuals.map(row=>chart.horizontal==='predicted'?row[3]:row[1]),y:fit.residuals.map(row=>row[4]),customdata:fit.residuals.map(row=>[row[0],row[1],row[2],row[3]]),marker:{color:chart.color,size:8},hovertemplate:'元の行 %{customdata[0]}<br>x=%{customdata[1]:.8g}<br>y=%{customdata[2]:.8g}<br>予測値=%{customdata[3]:.8g}<br>残差=%{y:.8g}<extra></extra>'};
    const layout=baseLayout(chart,'残差グラフ',dark,fontSize);layout.xaxis={...layout.xaxis,title:{text:escape(horizontal)}};layout.yaxis={...layout.yaxis,title:{text:escape(yAxis+' の残差')},zeroline:true,rangemode:'tozero',zerolinecolor:dark?'#e5e7eb':'#374151'};
    return {data:[trace],layout,summary:'有効な '+fit.n+' 組の '+yAxis+' の残差（実測値 − 予測値）を表示しています。',warnings:[]};
  }
  function buildScatter(chart,doc,dark,fontSize){
    let found;try{found=tableFor(doc,chart.seriesId);}catch(error){return empty(chart,error.message,dark,fontSize);}
    const {table}=found;if(!validColumn(table,chart.xColumn)||!validColumn(table,chart.yColumn))return empty(chart,'指定した列が数表にありません。列を選び直してください。',dark,fontSize);
    const pairs=[];for(let i=0;i<table.rows.length;i++){const x=table.rows[i][chart.xColumn],y=table.rows[i][chart.yColumn];if(x!==null&&y!==null)pairs.push({row:i+1,x,y});}
    if(!pairs.length)return empty(chart,'同じ行にそろった数値の組がありません。',dark,fontSize);
    const xName=escape(table.columns[chart.xColumn]),yName=escape(table.columns[chart.yColumn]);
    const data=[{type:'scatter',mode:'markers',name:title(chart,'散布図'),x:pairs.map(point=>point.x),y:pairs.map(point=>point.y),customdata:pairs.map(point=>[point.row]),marker:{color:chart.color,size:8},hovertemplate:'元の行 %{customdata[0]}<br>'+xName+'=%{x:.8g}<br>'+yName+'=%{y:.8g}<extra></extra>'}],warnings=[];
    let summary='有効な '+pairs.length+' 組を表示しています。';
    if(chart.model){const fit=Analysis.fit({rows:pairs.map(point=>[point.x,point.y])},chart.model);if(fit.warning)warnings.push(fit.warning);else {const low=fit.domain[0],high=fit.domain[1],xs=Array.from({length:129},(_,i)=>i===128?high:low+(high-low)*i/128);data.push({type:'scatter',mode:'lines',name:'回帰曲線',x:xs,y:xs.map(fit.predict),line:{color:chart.color,width:2}});const metrics=[];if(fit.r2!==null)metrics.push('R²='+Number(fit.r2).toPrecision(6));if(fit.r!==null)metrics.push('Pearson r='+Number(fit.r).toPrecision(6));if(fit.rmse!==null)metrics.push('RMSE='+Number(fit.rmse).toPrecision(6));summary+=' '+Analysis.equation(fit,table.columns[chart.xColumn],table.columns[chart.yColumn])+(metrics.length?'（'+metrics.join('、')+'）。':'。');}}
    const layout=baseLayout(chart,'散布図',dark,fontSize);layout.xaxis={...layout.xaxis,title:{text:xName}};layout.yaxis={...layout.yaxis,title:{text:yName}};
    return {data,layout,summary,warnings};
  }
  function buildHistogram(chart,doc,dark,fontSize){
    let found;try{found=tableFor(doc,chart.seriesId);}catch(error){return empty(chart,error.message,dark,fontSize);}
    const {table}=found;if(!validColumn(table,chart.column))return empty(chart,'指定した列が数表にありません。列を選び直してください。',dark,fontSize);
    const values=table.rows.map(row=>row[chart.column]).filter(value=>value!==null);if(!values.length)return empty(chart,'この列に数値がありません。',dark,fontSize,{x:table.columns[chart.column],y:'度数'});
    const min=Math.min(...values),max=Math.max(...values),requested=chart.bins===null?Math.max(1,Math.min(100,Math.ceil(Math.sqrt(values.length)))):chart.bins,range=max-min;
    // Skip arithmetic midpoints that collapse to the preceding IEEE-754 value.
    // The final maximum is always retained, and bins are never zero-width.
    const edges=[min];if(range>0&&finite(range))for(let i=1;i<requested;i++){const edge=min+range*i/requested;if(edge>edges[edges.length-1]&&edge<max)edges.push(edge);}if(max>edges[edges.length-1])edges.push(max);if(edges.length===1)edges.push(max);
    const bins=edges.length-1,counts=Array(bins).fill(0);
    for(const value of values){let position=0;if(range>0&&bins>1){let ratio=(value-min)/range*requested,nearest=Math.round(ratio);if(Math.abs(ratio-nearest)<=Number.EPSILON*64*Math.max(1,Math.abs(ratio)))ratio=nearest;position=Math.min(bins-1,Math.max(0,Math.floor(ratio)));while(position<bins-1&&value>=edges[position+1])position++;while(position>0&&value<edges[position])position--;}counts[position]++;}
    const labels=counts.map((_,i)=>'['+format(edges[i])+', '+format(edges[i+1])+(i===bins-1?']':')'));
    const centers=counts.map((_,i)=>edges[i]+(edges[i+1]-edges[i])/2),widths=counts.map((_,i)=>edges[i+1]-edges[i]||1);
    const trace={type:'bar',name:title(chart,'ヒストグラム'),x:centers,y:counts,width:widths,marker:{color:chart.color},customdata:labels.map((label,i)=>[label,counts[i]]),hovertemplate:'階級 %{customdata[0]}<br>度数 %{customdata[1]}<extra></extra>'};
    const layout=baseLayout(chart,'ヒストグラム',dark,fontSize);layout.xaxis={...layout.xaxis,title:{text:escape(table.columns[chart.column])}};layout.yaxis={...layout.yaxis,title:{text:'度数'},rangemode:'tozero',tick0:0,dtick:Math.max(1,Math.ceil(Math.max(...counts)/6))};
    return {data:[trace],layout,summary:'数値 '+values.length+' 個。'+labels.map((label,i)=>label+'：'+counts[i]).join('、'),warnings:[]};
  }
  function buildBox(chart,doc,dark,fontSize){
    let found;try{found=tableFor(doc,chart.seriesId);}catch(error){return empty(chart,error.message,dark,fontSize);}
    const {table}=found;if(chart.columns.some(column=>!validColumn(table,column)))return empty(chart,'指定した列が数表にありません。列を選び直してください。',dark,fontSize);
    const data=[],summaries=[];for(const column of chart.columns){const stats=Statistics.describe(table.rows.map(row=>row[column]));if(!stats.n){summaries.push(table.columns[column]+'：数値なし');continue;}data.push({type:'box',name:escape(table.columns[column]),x0:escape((column+1)+': '+table.columns[column]),q1:[stats.q1],median:[stats.median],q3:[stats.q3],lowerfence:[stats.min],upperfence:[stats.max],boxpoints:false,marker:{color:chart.color},line:{color:chart.color},hovertemplate:'Q1=%{q1:.8g}<br>中央値=%{median:.8g}<br>Q3=%{q3:.8g}<br>最小=%{lowerfence:.8g}<br>最大=%{upperfence:.8g}<extra>'+escape(table.columns[column])+'</extra>'});summaries.push(table.columns[column]+'：n='+stats.n+'、最小='+format(stats.min)+'、Q1='+format(stats.q1)+'、中央値='+format(stats.median)+'、Q3='+format(stats.q3)+'、最大='+format(stats.max));}
    if(!data.length)return empty(chart,'選んだ列に数値がありません。',dark,fontSize,{x:'列',y:'値'});
    const layout=baseLayout(chart,'箱ひげ図',dark,fontSize);layout.xaxis={...layout.xaxis,type:'category',title:{text:'列'}};layout.yaxis={...layout.yaxis,title:{text:'値'}};layout.showlegend=false;
    return {data,layout,summary:'四分位数は、並べたデータの中央値を奇数個では除き、上下半分の中央値として求めます。ひげは外れ値を除かず最小値・最大値です。'+summaries.join('。'),warnings:[]};
  }
  function build(chart,doc,{dark=false,fontSize=14}={}){
    if(!chart||!kinds.includes(chart.kind))return empty({name:''},'グラフの設定が不正です。',dark,fontSize);
    fontSize=finite(fontSize)&&fontSize>=8&&fontSize<=48?fontSize:14;
    if(chart.kind==='residual')return buildResidual(chart,doc,dark,fontSize);
    if(chart.kind==='scatter')return buildScatter(chart,doc,dark,fontSize);
    if(chart.kind==='histogram')return buildHistogram(chart,doc,dark,fontSize);
    return buildBox(chart,doc,dark,fontSize);
  }
  return {create,validate,prune,build};
});
