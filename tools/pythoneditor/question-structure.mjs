// Colab由来の見出しを表示用に読む。配信された問題・版・prompt自体は変更しない。
const majorPattern = /^(問|発展問題)\s*([0-9０-９]+)[.．、:：]?\s*/;
const minorPattern = /^[（(]\s*([0-9０-９]+)\s*[）)]\s*/;
const chapterPattern = /^[0-9０-９]+[-－][0-9０-９]+[.．_]\s*/;

export function plainHeading(value) {
  return String(value).replace(/^ {0,3}#{1,6}(?!#)\s*/, '').replace(/\s+#+\s*$/, '')
    .split(/(`+[^`]+`+)/).map(part => part.startsWith('`') ? part.replace(/^`+|`+$/g, '') : part.replace(/\*\*|__/g, '')).join('').trim();
}
export function promptHeadings(source) {
  const headings = [], lines = source.split('\n');
  let fence, html;
  for (const [line, value] of lines.entries()) {
    // 箇条書き内のフェンスもコードとして保護する。未知の深い字下げは保守的に扱う。
    const content = value.replace(/^\s*(?:[-+*]|[0-9]+[.)])\s+/, '');
    const marker = content.match(/^\s*(`{3,}|~{3,})(.*)$/);
    if (fence) {
      if (marker && marker[1][0] === fence.char && marker[1].length >= fence.length && !marker[2].trim()) fence = null;
      continue;
    }
    if (html) {
      if (html === 'comment' ? value.includes('-->') : new RegExp('</' + html + '\\s*>', 'i').test(value)) html = null;
      continue;
    }
    if (marker) { fence = { char: marker[1][0], length: marker[1].length }; continue; }
    if (/^\s*<!--/.test(content)) { if (!content.includes('-->')) html = 'comment'; continue; }
    // raw HTML内は見出しの移動対象にしない。特にpre/code内のコメントを本文と区別する。
    const tag = content.match(/^\s*<(pre|code|script|style|textarea|div|details|table|blockquote|ul|ol|section|article|figure|aside)\b/i);
    if (tag) { if (!new RegExp('</' + tag[1] + '\\s*>', 'i').test(content)) html = tag[1]; continue; }
    const match = value.match(/^ {0,3}(#{1,6})(?!#)\s*(.*?)\s*$/);
    if (match) headings.push({ line, level: match[1].length, text: plainHeading(value) });
  }
  return headings;
}
export function normalizePromptMarkdown(source) {
  const lines = source.split('\n');
  for (const heading of promptHeadings(source)) lines[heading.line] = lines[heading.line].replace(/^( {0,3}#{1,6})(?=[^\s#])/, '$1 ');
  return lines.join('\n');
}
const comparable = value => value.normalize('NFKC').replace(/\s+/g, '');

export function questionStructure(question, options = {}) {
  const source = question.prompt, headings = promptHeadings(source), title = question.title.trim();
  const titleMajor = title.match(majorPattern);
  const majorHeading = headings.find(h => {
    const match = h.text.match(majorPattern);
    return match && (!titleMajor || match[1] === titleMajor[1] && match[2].normalize('NFKC') === titleMajor[2].normalize('NFKC'));
  });
  const major = titleMajor || majorHeading?.text.match(majorPattern);
  const majorLabel = major ? major[1] + major[2].normalize('NFKC') : '';
  const short = title.replace(majorPattern, '').trim();
  const titleMinor = short.match(minorPattern);
  const minorHeadings = headings.filter(h => h.line > (majorHeading?.line ?? -1) && minorPattern.test(h.text));
  const minorHeading = titleMinor ? minorHeadings.find(h => h.text.match(minorPattern)[1].normalize('NFKC') === titleMinor[1].normalize('NFKC')) : minorHeadings[0];
  const minor = titleMinor || minorHeading?.text.match(minorPattern);
  const minorNumber = minor?.[1]?.normalize('NFKC') || '';
  const shortTitle = short.replace(minorPattern, '').trim() || title;
  const hasMinorInTitle = !!minorNumber && new RegExp('(?:^|[ \u3000])[（(]\\s*' + minorNumber + '\\s*[）)](?:[ \u3000]|$)').test(shortTitle.normalize('NFKC'));
  const removed = new Set();
  // 単元見出しは、冒頭にあり、その後に大問がある既知の構造だけを対象にする。
  const first = headings[0];
  if (first && majorHeading && first.line < majorHeading.line && first.level === 1 && chapterPattern.test(first.text) &&
      source.split('\n').slice(0, first.line).every(line => !line.trim())) removed.add(first.line);
  if (majorHeading && (options.groupTitle === undefined || options.groupTitle === majorHeading.text)) removed.add(majorHeading.line);
  if (minorHeading && minorHeading.text.match(minorPattern)[1].normalize('NFKC') === minorNumber) {
    const caption = comparable(minorHeading.text.replace(minorPattern, ''));
    // 「解法1」と「range(a)を使う場合」など、見出しだけの条件・補足は残す。
    if (caption && comparable(shortTitle).includes(caption)) removed.add(minorHeading.line);
  }
  const body = source.split('\n').map((value, line) => removed.has(line) ? '' : value);
  let firstBodyLine = 0;
  while (firstBodyLine < body.length && !body[firstBodyLine].trim()) firstBodyLine++;
  return { groupKey: majorLabel, groupTitle: majorHeading?.text || majorLabel,
    minor: minorNumber, shortTitle, hasMinorInTitle,
    title: [majorLabel, minorNumber && !hasMinorInTitle ? `(${minorNumber})` : '', shortTitle].filter(Boolean).join(' '),
    prompt: body.slice(firstBodyLine).join('\n') };
}
