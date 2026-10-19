// HTML14の表示用チェック。凍結採点結果を変更せず、srcの誤りと他の属性を分離する。
import {Parser, defaultTreeAdapter} from 'parse5';

const ENGINE = 'html-normal-1.0.0-html-css-0.3.0-parse5-8.0.1-csstree-3.2.1';
const EXCLUDED = new Set(['script','style','template','noscript','textarea','xmp','iframe','pre','code']);
const attr = (node,name) => node?.attrs?.find(a=>a.name===name)?.value ?? '';
const has = (node,name) => Boolean(node?.attrs?.some(a=>a.name===name));
const samePath = (value,expected) => value.replace(/^\.\//,'') === expected;
const integer = (value,expected) => /^\d+$/.test(value.trim()) && Number(value) === expected;

function images(source) {
  // GAS採点器と同じ非実行parser・上限。DOMParserや画像の読込みは使わない。
  let count = 0;
  const adapter = {...defaultTreeAdapter};
  for (const method of ['createElement','createCommentNode','createDocument','createDocumentFragment']) {
    adapter[method] = (...args) => {
      if (++count > 12000) throw Error('node_limit');
      return defaultTreeAdapter[method](...args);
    };
  }
  for (const method of ['appendChild','insertBefore']) {
    adapter[method] = (parent,...args) => {
      let depth = 0;
      for (let node=parent;node;node=node.parentNode) if (++depth > 128) throw Error('depth_limit');
      return defaultTreeAdapter[method](parent,...args);
    };
  }
  const parser = new Parser({scriptingEnabled:false,sourceCodeLocationInfo:true,treeAdapter:adapter,
    onParseError(error) { if (error.code !== 'missing-doctype') throw Error('parse_error'); }});
  const onStart = parser.onStartTag.bind(parser);
  parser.onStartTag = token => {
    onStart(token);
    if (parser.openElements.stackTop > 128) throw Error('depth_limit');
  };
  parser.tokenizer.write(source,true);
  const found = [], stack = [{node:parser.document,inert:false,inBody:false}];
  while (stack.length) {
    const {node,inert,inBody} = stack.pop();
    const excluded = inert || EXCLUDED.has(node.tagName) || has(node,'hidden');
    const body = inBody || node.tagName === 'body';
    if (!excluded && body && node.tagName === 'img' && node.namespaceURI === 'http://www.w3.org/1999/xhtml') found.push(node);
    const children = node.content ? [node.content,...(node.childNodes || [])] : node.childNodes || [];
    stack.push(...children.slice().reverse().map(child=>({node:child,inert:excluded,inBody:body})));
  }
  return found;
}

export function inspect(source,compiled,result) {
  try {
    if (typeof source !== 'string' || source.length > 2097152 || compiled?.targetId !== 'html14-01' ||
        compiled.version !== '2026-09-normal-gss-draft-1' || result?.rubricId !== compiled.targetId ||
        result.rubricVersion !== compiled.version || result.engineVersion !== ENGINE ||
        !['graded','needs_review'].includes(result.state) || !Array.isArray(result.diagnostics) ||
        result.diagnostics.some(d=>!['duplicate_answer','alt_requires_review'].includes(d.code))) return null;
    const ids = ['image-paths','image-widths','image-heights','image-alternatives'];
    if (compiled.rules?.length !== 4 || result.rules?.length !== 4) return null;
    const settings = ids.map(id=>{
      const matches = compiled.rules.filter(r=>r.ruleId===id);
      const checked = result.rules.filter(r=>r.ruleId===id);
      if (matches.length!==1 || checked.length!==1 || matches[0].enabled!==true || checked[0].enabled!==true) throw Error('rules');
      return matches[0].expected;
    });
    const [paths,widths,heights,alts] = [settings[0].images,settings[1].widths,settings[2].heights,settings[3].alternatives];
    if (![paths,widths,heights,alts].every(a=>Array.isArray(a) && a.length===5) ||
        new Set(paths.map(p=>p.src)).size!==5 || new Set(alts).size!==5) return null;
    const nodes = images(source);
    // 余分なimgや複数の曖昧な候補を順番だけで推測して合格させない。
    if (nodes.length > 5) return null;
    const selected = Array(5).fill(null), used = new Set();
    function assign(matches) {
      const pending = [];
      for (let i=0;i<5;i++) if (!selected[i]) {
        const found = nodes.filter(node=>!used.has(node) && matches(node,i));
        if (found.length===1) pending.push([i,found[0]]);
      }
      for (const [i,node] of pending) {
        if (pending.filter(item=>item[1]===node).length===1) { selected[i]=node; used.add(node); }
      }
    }
    // srcが一意なら従来の対応（記述順に依存しない）を維持する。
    assign((node,i)=>samePath(attr(node,'src'),paths[i].src));
    // srcの重複・誤記時は、残ったタグの一意なaltを手掛かりにする。
    assign((node,i)=>attr(node,'alt').trim()===alts[i]);
    const remainingRows = selected.map((node,i)=>node ? -1 : i).filter(i=>i>=0);
    const remainingNodes = nodes.filter(node=>!used.has(node));
    // srcとaltが両方誤っていても、残り1対象・1タグなら他属性を独立確認できる。
    if (remainingNodes.length===1 && remainingRows.length===1) selected[remainingRows[0]]=remainingNodes[0];
    else if (remainingNodes.length) return null;
    const check = (label,passed) => ({label,passed:Boolean(passed)});
    return {schema:'html-checkpoints-1',targetId:'html14-01',groups:[{title:'',legend:['画像','サイズ','代替テキスト'],
      rows:selected.map((node,i)=>({label:'写真0'+(i+1),checks:[
        check('画像',node && samePath(attr(node,'src'),paths[i].src)),
        check('サイズ（width・height）',node && integer(attr(node,'width'),widths[i]) &&
          (heights[i]===null ? !has(node,'height') : integer(attr(node,'height'),heights[i]))),
        check('代替テキスト（alt）',node && attr(node,'alt').trim()===alts[i])
      ]}))}]};
  } catch { return null; }
}
