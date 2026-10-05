/* 授業用の限定的なHTML/CSS検査。ブラウザの自動補完前に調べ、修正・通信はしない。 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.HtmlEditorDiagnostics = factory();
})(typeof globalThis === 'undefined' ? this : globalThis, function () {
  'use strict';
  const VERSION = 'classroom-html-css-1';
  const MAX_ERRORS = 100, MAX_LENGTH = 2 * 1024 * 1024;
  const VOID = new Set('area base br col embed hr img input link meta param source track wbr'.split(' '));
  const TAGS = new Set(('a abbr address area article aside audio b base bdi bdo blockquote body br button canvas caption cite code col colgroup data datalist dd del details dfn dialog div dl dt em embed fieldset figcaption figure footer form h1 h2 h3 h4 h5 h6 head header hgroup hr html i iframe img input ins kbd label legend li link main map mark menu meta meter nav noscript object ol optgroup option output p picture pre progress q rp rt ruby s samp script search section select slot small source span strong style sub summary sup table tbody td template textarea tfoot th thead time title tr track u ul var video wbr svg math ' +
    'acronym applet big center dir font frame frameset marquee noembed noframes param strike tt xmp').split(' '));
  const RAW = new Set('script style title textarea xmp iframe noembed noframes noscript'.split(' '));
  const OPTIONAL = new Set('html head body p li dt dd rt rp option optgroup colgroup thead tbody tfoot tr td th'.split(' '));
  const BLOCK = new Set('address article aside blockquote div dl fieldset figure footer form h1 h2 h3 h4 h5 h6 header hr main nav ol p pre section table ul'.split(' '));
  // 全属性の適否ではなく、主要属性への明確な1文字誤記だけを調べる。新しい属性を一律に拒否しない。
  const COMMON_ATTRIBUTES = 'id class style title lang dir href target rel download src alt width height charset name content http-equiv colspan rowspan border type value disabled'.split(' ');
  const KNOWN_ATTRIBUTES = new Set((COMMON_ATTRIBUTES.join(' ') + ' ' +
    'accesskey autocapitalize autocorrect autofocus contenteditable draggable enterkeyhint hidden inert inputmode is itemid itemprop itemref itemscope itemtype nonce part popover role slot spellcheck tabindex translate ' +
    'accept accept-charset action align allow allowfullscreen alpha as async autocomplete autoplay background bgcolor capture cellpadding cellspacing checked cite color colorspace cols compact controls coords crossorigin data datetime decoding default defer dirname enctype face fetchpriority for form formaction formenctype formmethod formnovalidate formtarget headers hreflang imagesizes imagesrcset integrity ismap label language list loading loop max maxlength media method min minlength multiple muted nomodule novalidate nowrap open optimum pattern ping placeholder playsinline popovertarget popovertargetaction poster preload readonly referrerpolicy required reversed rows sandbox scope selected shape size sizes span srcdoc srclang srcset start step summary usemap valign wrap').split(' '));
  const CHILDREN = new Map(Object.entries({
    html:'head body', head:'base link meta noscript script style template title',
    ul:'li script template', ol:'li script template', menu:'li script template', dl:'dt dd div script template',
    table:'caption colgroup thead tbody tfoot tr script template', colgroup:'col template',
    thead:'tr script template', tbody:'tr script template', tfoot:'tr script template', tr:'td th script template'
  }).map(([tag, children]) => [tag, new Set(children.split(' '))]));
  const PARENTS = new Map(Object.entries({
    head:'html', body:'html', li:'ul ol menu', caption:'table', colgroup:'table', col:'colgroup',
    thead:'table', tbody:'table', tfoot:'table', tr:'table thead tbody tfoot', td:'tr', th:'tr'
  }).map(([tag, parents]) => [tag, new Set(parents.split(' '))]));
  const PHRASING_ONLY = new Set('h1 h2 h3 h4 h5 h6 span strong em b i u s small mark sub sup code q abbr pre'.split(' '));
  const TRANSPARENT = new Set('a ins del'.split(' '));
  const PROPERTIES = new Set(('color background background-color background-image background-position background-repeat background-size background-attachment ' +
    'font font-family font-size font-style font-weight line-height text-align text-decoration text-indent text-transform letter-spacing word-spacing white-space vertical-align ' +
    'margin margin-top margin-right margin-bottom margin-left padding padding-top padding-right padding-bottom padding-left ' +
    'border border-width border-style border-color border-top border-right border-bottom border-left border-collapse border-spacing border-radius ' +
    'width height min-width max-width min-height max-height display visibility overflow overflow-x overflow-y opacity box-sizing box-shadow ' +
    'position top right bottom left z-index float clear list-style list-style-type list-style-position list-style-image ' +
    'content cursor transform transition animation align-items align-content justify-content flex flex-direction flex-wrap gap row-gap column-gap ' +
    'grid grid-template-columns grid-template-rows object-fit object-position outline outline-color outline-width outline-style').split(' '));
  function check(source, options = {}) {
    const text = String(source), errors = [], seen = new Set(), starts = [0];
    if (text.length > MAX_LENGTH) return {version:VERSION, errors:[{line:1, column:1, code:'source-limit',
      message:'検査できる大きさを超えています。ファイルを分けて確認してください。'}], valid:false, limited:true};
    for (let i = 0; i < text.length; i++) if (text[i] === '\n') starts.push(i + 1);
    function add(offset, code, message) {
      offset = Math.max(0, Math.min(text.length, offset));
      let low = 0, high = starts.length;
      while (low + 1 < high) { const mid = (low + high) >> 1; if (starts[mid] <= offset) low = mid; else high = mid; }
      const key = low + ':' + code + ':' + message;
      if (errors.length >= MAX_ERRORS || seen.has(key)) return;
      seen.add(key); errors.push({line:low + 1, column:offset - starts[low] + 1, code, message});
    }
    if (options.mode === 'css') css(text, 0, false, add, options);
    else html(text, add, options);
    errors.sort((a, b) => a.line - b.line || a.column - b.column || a.code.localeCompare(b.code));
    return {version:VERSION, errors, valid:errors.length === 0, limited:errors.length >= MAX_ERRORS};
  }
  function html(text, add, options) {
    const stack = [], found = new Set();
    let i = 0;
    function unclosed(item) {
      add(item.offset, OPTIONAL.has(item.tag) ? 'html-explicit-end' : 'html-unclosed-tag',
        OPTIONAL.has(item.tag) ? '<' + item.tag + '> の終了タグがありません。HTML規格では省略できる場合もありますが、この実習では明示して書きます。' :
          '<' + item.tag + '> の終了タグが見つかりません。開始・終了の対応を見直してください。');
    }
    while ((i = text.indexOf('<', i)) !== -1) {
      if (text.startsWith('<!--', i)) {
        const end = text.indexOf('-->', i + 4);
        if (end < 0) { add(i, 'html-comment', 'コメントが閉じられていません。コメントの始まりと終わりを確認してください。'); break; }
        i = end + 3; continue;
      }
      if (/^<!doctype\b/i.test(text.slice(i, i + 12))) {
        const end = text.indexOf('>', i + 2);
        if (end < 0) { add(i, 'html-tag-end', '宣言の終わりが見つかりません。'); break; }
        i = end + 1; continue;
      }
      const token = /^<(\/?)([a-z][a-z0-9:-]*)(?=[\s/>]|$)/i.exec(text.slice(i));
      // 本文の「1 < 2」や &lt; はタグにしない。次の本物のタグを飲み込まない。
      if (!token) { i++; continue; }
      const offset = i, tag = token[2].toLowerCase(), closing = Boolean(token[1]);
      let end = i + token[0].length, quote = '';
      for (; end < text.length; end++) {
        const ch = text[end];
        if (quote) { if (ch === quote) quote = ''; }
        else if (ch === '"' || ch === "'") quote = ch;
        else if (ch === '>') break;
        else if (ch === '<') break;
      }
      if (end === text.length || text[end] !== '>') {
        add(offset, quote ? 'html-attribute-quote' : 'html-tag-end', quote ? '属性値を囲む引用符が閉じられていません。' : 'タグの終わりが見つかりません。');
        if (end === text.length) break;
        i = end; continue;
      }
      const foreign = stack.some(item => item.foreign), inert = stack.some(item => item.tag === 'template' || item.foreign);
      const ownForeign = tag === 'svg' || tag === 'math', selfClosing = /\/\s*$/.test(text.slice(i, end));
      if (!foreign && !TAGS.has(tag) && !tag.includes('-')) add(offset, 'html-tag-name', 'HTMLのタグ名として確認できません。つづりを見直してください。');
      if (closing) {
        if (!foreign && VOID.has(tag)) add(offset, 'html-void-end', '<' + tag + '> は終了タグを使わない要素です。');
        else {
          const index = stack.map(item => item.tag).lastIndexOf(tag);
          if (index < 0) add(offset, 'html-unexpected-close', '対応する開始タグが見つかりません。開始・終了の対応を見直してください。');
          else {
            while (stack.length > index + 1) unclosed(stack.pop());
            stack.pop();
          }
        }
      } else {
        // 属性名と値の位置を分ける。raw text要素の属性も、本文を読み飛ばす前に調べる。
        const attrBase = offset + token[0].length;
        const attrs = attributes(text.slice(attrBase, end));
        if (!foreign) for (const attr of attrs) {
          if (!ownForeign && TAGS.has(tag) && !KNOWN_ATTRIBUTES.has(attr.name) && !/^(?:data-|aria-|on)/.test(attr.name) && /^[a-z][a-z0-9-]*$/.test(attr.name) &&
              COMMON_ATTRIBUTES.some(name => distanceOne(name, attr.name))) {
            add(attrBase + attr.nameAt, 'html-attribute-name', 'HTMLの属性名として確認できません。つづりを見直してください。');
          }
          // 独自要素やsvg/math開始タグのstyle値も、従来どおりCSSとして確認する。
          if (attr.name === 'style' && attr.hasValue && !/&(?:#\w+|\w+);/.test(attr.value)) {
            css(attr.value, attrBase + attr.at, true, add, options);
          }
        }
        if (!inert && (tag === 'html' || tag === 'head' || tag === 'body')) {
          if (found.has(tag)) add(offset, 'html-duplicate-structure', '文書の構成タグが重複しています。');
          found.add(tag);
        }
        if (!foreign) {
          if (tag === 'body' && stack.some(item => item.tag === 'head')) add(offset, 'html-nesting', 'headとbodyの区切りを確認してください。');
          // 規格上の暗黙終了は入れ子エラーと呼ばず、授業用の明示終了ルールとして扱う。
          if (!inert && BLOCK.has(tag)) {
            const p = stack.map(item => item.tag).lastIndexOf('p');
            if (p >= 0) while (stack.length > p) unclosed(stack.pop());
          }
          if (tag === 'li' && stack.at(-1)?.tag === 'li') unclosed(stack.pop());
          if (tag === 'a' && stack.some(item => item.tag === 'a') ||
              ['td','th','tr'].includes(tag) && ['td','th'].includes(stack.at(-1)?.tag)) add(offset, 'html-nesting', 'タグが正しく入れ子になっていません。囲む順番を見直してください。');
        }
        if (!inert && TAGS.has(tag)) placement(tag, stack, found, attrs, offset, add);
        if (!VOID.has(tag) || foreign) {
          if (!(selfClosing && (foreign || ownForeign))) {
            if (stack.length >= 256) { add(offset, 'source-depth', 'タグの入れ子が検査の上限を超えています。文書の構成を見直してください。'); break; }
            stack.push({tag, offset, foreign:ownForeign});
          }
          if (selfClosing && !foreign && !ownForeign) add(offset, 'html-self-closing', 'この要素はスラッシュだけでは閉じられません。開始・終了の対応を見直してください。');
        }
        if (!foreign && RAW.has(tag)) {
          const close = new RegExp('</' + tag + '\\s*>', 'ig'); close.lastIndex = end + 1;
          const match = close.exec(text);
          if (!match) { i = text.length; break; }
          if (tag === 'style') css(text.slice(end + 1, match.index), end + 1, false, add, options);
          stack.pop(); i = close.lastIndex; continue;
        }
      }
      i = end + 1;
    }
    stack.forEach(unclosed);
    ['html','body'].forEach(tag => { if (!found.has(tag)) add(0, 'html-required-' + tag, '<' + tag + '> の開始タグがありません。この実習では文書の構成を明示して書きます。'); });
  }
  function placement(tag, stack, found, attrs, offset, add) {
    const parent = stack.at(-1)?.tag;
    const warn = message => add(offset, 'html-placement', message);
    if (tag === 'html' && parent || tag !== 'html' && !parent || PARENTS.has(tag) && !PARENTS.get(tag).has(parent)) {
      warn('<' + tag + '> を置く場所が合っていません。外側のタグとの関係を見直してください。'); return;
    }
    if (CHILDREN.has(parent) && !CHILDREN.get(parent).has(tag)) {
      warn('<' + tag + '> はこの位置に直接置けません。外側のタグとの関係を見直してください。'); return;
    }
    if (tag === 'head' && found.has('body')) warn('headとbodyの順序を見直してください。');
    if (['base','title','style'].includes(tag) && parent !== 'head' ||
        tag === 'meta' && parent !== 'head' && !attrs.some(attr => attr.name === 'itemprop')) {
      warn('<' + tag + '> を置く場所が合っていません。文書の構成を見直してください。');
    }
    const dlGroup = parent === 'div' && stack.at(-2)?.tag === 'dl';
    if (['dt','dd'].includes(tag) && parent !== 'dl' && !dlGroup ||
        dlGroup && !['dt','dd','script','template'].includes(tag)) {
      warn('説明リストのタグを置く場所が合っていません。外側のタグとの関係を見直してください。');
    }
    // a等は外側の内容モデルを引き継ぐ。aでdivを囲むだけでは誤りにしない。
    let enclosing = stack.length - 1;
    while (enclosing >= 0 && TRANSPARENT.has(stack[enclosing].tag)) enclosing--;
    if (PHRASING_ONLY.has(stack[enclosing]?.tag) && BLOCK.has(tag)) {
      warn('このタグの中には、このまとまりのタグを置けません。囲む関係を見直してください。');
    }
    if (tag === 'form' && stack.some(item => item.tag === 'form')) warn('formを重ねて囲んでいないか確認してください。');
  }
  function attributes(text) {
    const result = []; let i = 0;
    while (i < text.length) {
      while (/\s/.test(text[i] || '') || text[i] === '/') i++;
      const match = /^[^\s=/>"'<]+/.exec(text.slice(i));
      if (!match) { i++; continue; }
      const nameAt = i, name = match[0].toLowerCase(); i += match[0].length;
      while (/\s/.test(text[i] || '')) i++;
      if (text[i] !== '=') { result.push({name, nameAt, at:i, value:'', hasValue:false}); continue; }
      i++; while (/\s/.test(text[i] || '')) i++;
      const quote = ['"',"'"].includes(text[i]) ? text[i++] : '';
      const at = i;
      if (quote) { while (i < text.length && text[i] !== quote) i++; }
      else { while (i < text.length && !/\s/.test(text[i])) i++; }
      result.push({name, nameAt, value:text.slice(at, i), at, hasValue:true});
      if (quote) i++;
    }
    return result;
  }
  function css(source, base, inline, add, options) {
    const text = source, error = (at, code, message) => add(base + at, code, message);
    const maskComments = value => value.replace(/\/\*[\s\S]*?\*\//g, match => match.replace(/[^\n]/g, ' '));
    const clean = value => maskComments(value).trim();
    function declaration(value, at) {
      const s = clean(value); if (!s || s.startsWith('@')) return;
      at += Math.max(0, maskComments(value).search(/\S/));
      const match = /^([a-z_-][\w-]*)\s*:\s*([\s\S]*)$/i.exec(s);
      if (!match) { error(at, 'css-declaration', 'CSSのプロパティと値の区切りを確認してください。'); return; }
      const name = match[1].toLowerCase(), raw = match[2], val = raw.replace(/\s*!important\s*$/i, '').trim();
      if (!val) { error(at, 'css-value-empty', 'CSSの値がありません。'); return; }
      if (name.startsWith('--') || name.startsWith('-')) return; // 独自・ベンダー指定は未対応と構文エラーを混同しない。
      const supports = options.supports;
      let supported = PROPERTIES.has(name);
      if (supports) {
        try { supported = Boolean(supports(name, 'initial')); } catch { /* 検査範囲外は止めない。 */ }
      }
      // CSS.supportsがない環境では、授業範囲のプロパティの明確なつづり間違いだけを調べる。
      if (!supported && [...PROPERTIES].some(p => p.replace(/-/g,'') === name.replace(/-/g,'') || distanceOne(p, name))) {
        error(at, 'css-property', 'CSSのプロパティ名として確認できません。つづりを見直してください。'); return;
      }
      if (supports && supported && !/\b(?:var|env)\s*\(/i.test(val)) {
        try { if (!supports(name, val)) error(at, 'css-value', 'このCSSの値を読み取れません。つづり・単位・区切りを確認してください。'); } catch { /* ブラウザで検査できない指定は止めない。 */ }
      }
    }
    function block(start, mode, opened, depth = 0) {
      if (depth >= 64) {
        error(opened ?? start, 'source-depth', 'CSSの入れ子が検査の上限を超えています。構成を見直してください。');
        return text.length;
      }
      let segment = start, i = start, quote = '', escaped = false, comment = -1, parens = [], brackets = [];
      for (; i < text.length; i++) {
        const ch = text[i], next = text[i + 1];
        if (comment >= 0) { if (ch === '*' && next === '/') { comment = -1; i++; } continue; }
        if (quote) {
          if (escaped) escaped = false;
          else if (ch === '\\') escaped = true;
          else if (ch === quote) quote = '';
          else if (ch === '\n') { error(i, 'css-string', 'CSSの文字列を囲む引用符を確認してください。'); quote = ''; }
          continue;
        }
        if (ch === '/' && next === '*') { comment = i; i++; continue; }
        if (ch === '"' || ch === "'") { quote = ch; continue; }
        if (ch === '\\') { i++; continue; }
        if (ch === '(') { parens.push(i); continue; }
        if (ch === '[') { brackets.push(i); continue; }
        if (ch === ')') { if (!parens.length) error(i, 'css-parenthesis', 'CSSの丸括弧の対応を確認してください。'); else parens.pop(); continue; }
        if (ch === ']') { if (!brackets.length) error(i, 'css-bracket', 'CSSの角括弧の対応を確認してください。'); else brackets.pop(); continue; }
        if (parens.length || brackets.length) continue;
        if (ch === '{') {
          const prefix = clean(text.slice(segment, i));
          if (mode === 'declarations' && /^--[\w-]+\s*:/.test(prefix)) {
            // 独自プロパティのブロック値を通常の規則と混同しない。
            i = block(i + 1, 'custom', i, depth + 1); continue;
          }
          if (mode === 'custom') { i = block(i + 1, 'custom', i, depth + 1); continue; }
          if (!prefix) error(segment, 'css-selector', 'CSSでどの要素を指定するかを確認してください。');
          else if (mode === 'declarations' && !prefix.startsWith('@') && !/[&.#:[>+~]/.test(prefix)) error(segment, 'css-brace', 'CSSの波括弧と宣言の区切りを確認してください。');
          if (options.selector && !prefix.startsWith('@') && mode === 'rules') {
            try { if (!options.selector(prefix)) error(segment, 'css-selector', 'CSSのセレクタを読み取れません。つづり・区切りを確認してください。'); } catch { /* 新しい書式は範囲外 */ }
          }
          // keyframesの0%/100%は要素セレクタではないのでquerySelectorに渡さない。
          const nested = /^@(?:-\w+-)?keyframes\b/i.test(prefix) ? 'keyframes' :
            /^@(?:media|supports|container|layer|document|scope)\b/i.test(prefix) ? 'rules' : 'declarations';
          i = block(i + 1, nested, i, depth + 1); segment = i + 1; continue;
        }
        if (ch === ';' || ch === '}') {
          const value = text.slice(segment, i);
          if (mode === 'declarations') declaration(value, segment);
          else if (mode === 'rules' && clean(value) && !clean(value).startsWith('@')) error(segment, 'css-rule', 'CSSのセレクタと波括弧の対応を確認してください。');
          segment = i + 1;
          if (ch === '}') { if (opened == null) error(i, 'css-brace', '対応するCSSの開始波括弧がありません。'); else return i; }
        }
      }
      if (comment >= 0) error(comment, 'css-comment', 'CSSのコメントが閉じられていません。');
      if (quote) error(segment, 'css-string', 'CSSの文字列を囲む引用符が閉じられていません。');
      parens.forEach(at => error(at, 'css-parenthesis', 'CSSの丸括弧が閉じられていません。'));
      brackets.forEach(at => error(at, 'css-bracket', 'CSSの角括弧が閉じられていません。'));
      if (mode === 'declarations') declaration(text.slice(segment), segment);
      else if (mode === 'rules' && clean(text.slice(segment))) error(segment, 'css-rule', 'CSSの規則の終わりを確認してください。');
      if (opened != null) error(opened, 'css-brace', 'CSSの波括弧が閉じられていません。');
      return text.length;
    }
    block(0, inline ? 'declarations' : 'rules', null);
  }
  function distanceOne(a, b) {
    if (a === b || Math.abs(a.length - b.length) > 1) return false;
    if (a.length === b.length) {
      const differing = [...a].map((ch, i) => ch === b[i] ? -1 : i).filter(i => i >= 0);
      if (differing.length === 2 && differing[1] === differing[0] + 1 && a[differing[0]] === b[differing[1]] && a[differing[1]] === b[differing[0]]) return true;
    }
    let i = 0, j = 0, edits = 0;
    while (i < a.length && j < b.length) {
      if (a[i] === b[j]) { i++; j++; continue; }
      if (++edits > 1) return false;
      if (a.length >= b.length) i++;
      if (b.length >= a.length) j++;
    }
    return edits + (i < a.length || j < b.length ? 1 : 0) === 1;
  }
  return Object.freeze({VERSION, check});
});
