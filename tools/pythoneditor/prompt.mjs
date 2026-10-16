import { normalizePromptMarkdown } from './question-structure.mjs?v=20261016-prompt-structure1';

export function renderPrompt(container, source) {
  // Markdown/HTMLの本文はデータとして扱い、スクリプト・属性・外部画像を通さない。
  if (!globalThis.marked || !globalThis.DOMPurify) { container.textContent = source; return; }
  const normalized = normalizePromptMarkdown(source);
  const fragment = DOMPurify.sanitize(marked.parse(normalized), {
    RETURN_DOM_FRAGMENT: true,
    ALLOWED_TAGS: ['p','br','strong','em','b','i','s','code','pre','h1','h2','h3','h4','h5','h6','blockquote','ul','ol','li','table','thead','tbody','tr','th','td','details','summary','span','div','a','hr','font','sub','sup'],
    ALLOWED_ATTR: ['href','colspan','rowspan','open'],
    ALLOW_DATA_ATTR: false, ALLOW_ARIA_ATTR: false
  });
  for (const a of fragment.querySelectorAll('a')) {
    const href = a.getAttribute('href');
    if (!href || !/^https:\/\//.test(href)) a.removeAttribute('href');
    else { a.target = '_blank'; a.rel = 'noopener noreferrer'; }
  }
  container.replaceChildren(fragment);
  // KaTeXはこのアプリが同梱するレンダラー。trusted HTMLや外部URLのTeX命令を許可しない。
  if (globalThis.renderMathInElement) renderMathInElement(container, {
    delimiters: [{left:'$$',right:'$$',display:true},{left:'$',right:'$',display:false},{left:'\\(',right:'\\)',display:false},{left:'\\[',right:'\\]',display:true}],
    throwOnError: false, trust: false, strict: 'ignore'
  });
}
