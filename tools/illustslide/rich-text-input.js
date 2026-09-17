/* 文字単位の書式を持つ入力欄。IME中はDOMを描き直さず、確定後に読み取る。 */
(function () {
  'use strict';
  const clone = value => JSON.parse(JSON.stringify(value));
  const keys = ['script', 'bold', 'italic', 'fill'];
  const mark = value => Object.fromEntries(keys.filter(key => value[key] !== undefined).map(key => [key, value[key]]));
  const signature = value => JSON.stringify(keys.map(key => value[key]));
  function segments(text) {
    if (Intl.Segmenter) return [...new Intl.Segmenter('ja', { granularity: 'grapheme' }).segment(text)].map(part => ({ text: part.segment, index: part.index }));
    let index = 0;
    return Array.from(text).map(part => { const result = { text: part, index }; index += part.length; return result; });
  }
  function plainText(node) {
    if (node.nodeType === 3) return node.nodeValue;
    if (node.nodeType === 1 && node.hasAttribute('data-rich-end')) return '';
    if (node.nodeName === 'BR') return '\n';
    let result = '';
    for (const child of node.childNodes) {
      const block = /^(DIV|P|LI)$/.test(child.nodeName);
      if (block && result && !result.endsWith('\n')) result += '\n';
      result += plainText(child);
      if (block && child.nextSibling && !result.endsWith('\n')) result += '\n';
    }
    return result;
  }
  function create(element, options) {
    let base = { ...options.style }, original = clone(options.runs), pristine = true;
    let chars = original.flatMap(run => run.text.split('').map(text => ({ ...mark(run), text })));
    let previous = chars.map(char => char.text).join(''), saved = { start: 0, end: 0 }, typing = null, inputMark = null;
    let composing = false, ending = false, timer = null, destroyed = false;
    const abort = new AbortController(), listen = (target, type, fn) => target.addEventListener(type, fn, { signal: abort.signal });
    function selection() {
      const current = window.getSelection();
      if (current?.rangeCount && element.contains(current.anchorNode) && element.contains(current.focusNode)) {
        const range = current.getRangeAt(0), before = document.createRange();
        before.selectNodeContents(element); before.setEnd(range.startContainer, range.startOffset);
        const start = plainText(before.cloneContents()).length;
        before.setEnd(range.endContainer, range.endOffset);
        saved = { start, end: plainText(before.cloneContents()).length };
      }
      return { start: Math.min(saved.start, previous.length), end: Math.min(saved.end, previous.length) };
    }
    function select(start, end = start, focus = true) {
      saved = { start: Math.max(0, Math.min(start, previous.length)), end: Math.max(0, Math.min(end, previous.length)) };
      if (focus) element.focus({ preventScroll: true });
      const nodes = [], walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
      while (walker.nextNode()) nodes.push(walker.currentNode);
      const locate = offset => {
        for (const node of nodes) { if (offset <= node.length) return [node, offset]; offset -= node.length; }
        return [element, element.childNodes.length];
      };
      const range = document.createRange(); range.setStart(...locate(saved.start)); range.setEnd(...locate(saved.end));
      const current = window.getSelection(); current.removeAllRanges(); current.addRange(range);
    }
    function runs() {
      if (pristine) return clone(original);
      const result = [];
      for (const part of segments(previous)) {
        const format = { script: 'normal', ...mark(chars[part.index] || {}) }, last = result.at(-1);
        if (last && signature(last) === signature(format)) last.text += part.text;
        else result.push({ text: part.text, ...format });
      }
      return result.length ? result : [{ text: '', script: 'normal' }];
    }
    function effective(format) { return { script: format?.script || 'normal', bold: format?.bold ?? base.bold, italic: format?.italic ?? base.italic, fill: format?.fill ?? base.fill }; }
    function format() {
      const range = selection(), values = range.start === range.end ? [effective(typing || chars[Math.max(0, range.start - 1)] || {})] : chars.slice(range.start, range.end).map(effective);
      const result = { ...values[0] };
      for (const key of keys) if (values.some(value => value[key] !== result[key])) result[key] = null;
      return result;
    }
    function paint(target, values, style = base) {
      target.replaceChildren();
      target.style.fontFamily = style.fontFamily;
      target.style.fontWeight = style.bold ? '700' : '400'; target.style.fontStyle = style.italic ? 'italic' : 'normal';
      target.style.color = style.fill === 'none' ? '#64748b' : style.fill;
      for (const run of values) {
        const span = document.createElement('span'); span.textContent = run.text;
        span.className = 'text-script-' + run.script;
        if (run.bold !== undefined) span.style.fontWeight = run.bold ? '700' : '400';
        if (run.italic !== undefined) span.style.fontStyle = run.italic ? 'italic' : 'normal';
        if (run.fill !== undefined) span.style.color = run.fill === 'none' ? '#64748b' : run.fill;
        target.append(span);
      }
      if (values.map(run => run.text).join('').endsWith('\n')) { const end = document.createElement('br'); end.dataset.richEnd = ''; target.append(end); }
    }
    function render(keep = true) {
      if (composing || destroyed) return;
      const active = document.activeElement === element, range = saved, scroll = element.scrollTop;
      paint(element, runs());
      if (active && keep) select(range.start, range.end, false);
      element.scrollTop = scroll;
    }
    function changed() { if (!destroyed && element.isConnected) options.onChange?.(); }
    function update() {
      if (destroyed || !element.isConnected) return;
      const current = window.getSelection(), range = current?.rangeCount && element.contains(current.anchorNode) ? current.getRangeAt(0) : null;
      let next = plainText(element);
      if (element.childNodes.length === 1 && element.firstChild.nodeName === 'BR') next = '';
      let caret;
      if (range) { const before = document.createRange(); before.selectNodeContents(element); before.setEnd(range.endContainer, range.endOffset); caret = plainText(before.cloneContents()).length; }
      if (next.length > options.limit) { options.onError?.('文章が長すぎます。文字数を減らしてください。'); render(); return; }
      let prefix = 0, suffix = 0;
      while (prefix < Math.min(previous.length, next.length) && previous[prefix] === next[prefix]) prefix++;
      while (suffix < Math.min(previous.length - prefix, next.length - prefix) && previous[previous.length - suffix - 1] === next[next.length - suffix - 1]) suffix++;
      if (next !== previous) {
        const inherited = inputMark || typing || mark(chars[Math.max(0, prefix - 1)] || { script: 'normal' });
        chars = [...chars.slice(0, prefix), ...next.slice(prefix, next.length - suffix).split('').map(text => ({ ...inherited, text })), ...chars.slice(previous.length - suffix)];
        previous = next; pristine = false;
      }
      inputMark = null; saved = { start: caret ?? previous.length, end: caret ?? previous.length };
      render(); changed();
    }
    function replace(values) {
      if (composing) return false;
      const range = selection(), inserted = values.flatMap(run => run.text.split('').map(text => ({ ...mark(run), text })));
      if (previous.length - range.end + range.start + inserted.length > options.limit) { options.onError?.('文章が長すぎます。文字数を減らしてください。'); return false; }
      chars.splice(range.start, range.end - range.start, ...inserted); previous = chars.map(char => char.text).join(''); pristine = false;
      saved = { start: range.start + inserted.length, end: range.start + inserted.length }; typing = null;
      render(false); select(saved.start, saved.end); changed(); options.onSelection?.(); return true;
    }
    function apply(patch, focus = true) {
      if (composing) return;
      const range = selection();
      if (range.start === range.end) { typing = { ...mark(chars[Math.max(0, range.start - 1)] || { script: 'normal' }), ...typing, ...patch }; if (focus) element.focus({ preventScroll: true }); options.onSelection?.(); return; }
      let updated = false;
      for (const part of segments(previous)) if (part.index < range.end && part.index + part.text.length > range.start) {
        for (let i = part.index; i < part.index + part.text.length; i++) {
          for (const key of Object.keys(patch)) if (effective(chars[i])[key] !== patch[key]) { chars[i][key] = patch[key]; updated = true; }
        }
      }
      if (updated) { pristine = false; render(false); if (focus) select(range.start, range.end); changed(); }
      else if (focus) select(range.start, range.end);
      options.onSelection?.();
    }
    function endComposition() {
      if (destroyed || !element.isConnected || !ending) return;
      ending = false; composing = false; delete element.dataset.richComposing; update(); options.onSelection?.();
    }
    function rememberInputMark() {
      const range = selection(), index = range.start === range.end ? Math.max(0, range.start - 1) : range.start;
      inputMark = typing || mark(chars[index] || { script: 'normal' });
    }
    listen(element, 'compositionstart', () => { rememberInputMark(); clearTimeout(timer); composing = true; ending = false; element.dataset.richComposing = 'true'; });
    listen(element, 'compositionend', () => { ending = true; timer = setTimeout(endComposition, 0); });
    listen(element, 'input', event => { if (!composing && !event.isComposing) update(); });
    listen(element, 'beforeinput', event => {
      if (composing || event.isComposing) return;
      rememberInputMark();
      if (['insertParagraph', 'insertLineBreak'].includes(event.inputType)) { event.preventDefault(); replace([{ text: '\n', ...effective(typing || chars[Math.max(0, selection().start - 1)] || {}) }]); }
      if (['formatBold', 'formatItalic'].includes(event.inputType)) { event.preventDefault(); const key = event.inputType === 'formatBold' ? 'bold' : 'italic'; apply({ [key]: !format()[key] }); }
    });
    listen(element, 'paste', event => { event.preventDefault(); if (composing) return; replace([{ text: (event.clipboardData?.getData('text/plain') || '').replace(/\r\n?/g, '\n'), ...effective(typing || chars[Math.max(0, selection().start - 1)] || {}) }]); });
    listen(element, 'drop', event => { event.preventDefault(); options.onError?.('文字の貼り付けは⌘Vで行えます。'); });
    listen(element, 'keydown', event => { if (!composing && !event.isComposing && (event.metaKey || event.ctrlKey) && ['b', 'i'].includes(event.key.toLowerCase())) { event.preventDefault(); const key = event.key.toLowerCase() === 'b' ? 'bold' : 'italic'; apply({ [key]: !format()[key] }); } });
    listen(element, 'pointerdown', () => { if (!composing) typing = null; });
    listen(element, 'keyup', event => { if (!composing && /^(Arrow|Home|End)/.test(event.key)) typing = null; options.onSelection?.(); });
    listen(document, 'selectionchange', () => {
      if (!element.isConnected) { destroy(); return; }
      if (!composing && element.contains(window.getSelection()?.anchorNode)) { selection(); options.onSelection?.(); }
    });
    function destroy() { destroyed = true; clearTimeout(timer); abort.abort(); }
    render(false);
    return { element, runs, selection, select, format, apply, insert: replace, paint, destroy,
      text: () => previous, isComposing: () => composing,
      setStyle(value) { base = { ...value }; selection(); render(); },
      focus() { select(saved.start, saved.end); } };
  }
  window.IlapoRichText = Object.freeze({ create });
}());
