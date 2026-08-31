import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDirectory, '..');
const pagesPath = path.join(projectRoot, 'js', 'pages.js');
const outputPath = path.join(projectRoot, 'data', 'search-index.json');
const checkOnly = process.argv.includes('--check');

const EXCLUDED_PAGE_IDS = new Set(['faq', 'gfe', 'link', 'print', 'test']);
const EXCLUDED_PATH_PREFIXES = ['archive/', 'html/', 'teacher-tools/', 'test/'];
const COURSE_KEYS = new Map([
  ['HTML実習', 'html'],
  ['Illustrator実習', 'il'],
  ['スプレッドシート実習', 'ss'],
  ['Python講座', 'py']
]);

const ENTITY_MAP = new Map([
  ['amp', '&'],
  ['apos', "'"],
  ['gt', '>'],
  ['lt', '<'],
  ['nbsp', ' '],
  ['quot', '"'],
  ['ensp', ' '],
  ['emsp', ' '],
  ['thinsp', ' '],
  ['hellip', '…'],
  ['ndash', '–'],
  ['mdash', '—'],
  ['times', '×'],
  ['divide', '÷'],
  ['le', '≤'],
  ['ge', '≥'],
  ['ne', '≠'],
  ['rarr', '→'],
  ['larr', '←']
]);

function assertInsideProject(filePath, label) {
  const relative = path.relative(projectRoot, filePath);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`${label}がプロジェクト外を参照しています。`);
  }
}

function decodeEntities(value) {
  return String(value || '').replace(
    /&(#x[\da-f]+|#\d+|[a-z][\da-z]+);/gi,
    (entity, name) => {
      if (name[0] === '#') {
        const hexadecimal = name[1]?.toLowerCase() === 'x';
        const number = Number.parseInt(name.slice(hexadecimal ? 2 : 1), hexadecimal ? 16 : 10);
        return Number.isFinite(number) ? String.fromCodePoint(number) : entity;
      }
      return ENTITY_MAP.get(name.toLowerCase()) ?? ' ';
    }
  );
}

function normalizeWhitespace(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function removeIgnoredBlocks(value) {
  return String(value || '')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|noscript|svg|template)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, ' ')
    .replace(/<(form|fieldset|button|select|textarea|output|label)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, ' ')
    .replace(/<input\b[^>]*>/gi, ' ')
    .replace(/<div\b[^>]*class\s*=\s*(?:"[^"]*\balgorithm-(?:actions|controls|legend|status)\b[^"]*"|'[^']*\balgorithm-(?:actions|controls|legend|status)\b[^']*')[^>]*>[\s\S]*?<\/div\s*>/gi, ' ');
}

function stripHtml(value) {
  const withBreaks = removeIgnoredBlocks(value)
    .replace(/<(br|hr)\b[^>]*>/gi, ' ')
    .replace(/<\/(p|div|li|tr|td|th|section|article|details|summary)>/gi, ' ');

  return normalizeWhitespace(decodeEntities(withBreaks.replace(/<[^>]*>/g, ' ')));
}

function extractTextAndCode(value) {
  let remaining = removeIgnoredBlocks(value);
  const codeParts = [];

  remaining = remaining.replace(/<pre\b[^>]*>([\s\S]*?)<\/pre\s*>/gi, (_match, body) => {
    const code = stripHtml(body);
    if (code) codeParts.push(code);
    return ' ';
  });

  remaining = remaining.replace(/<code\b[^>]*>([\s\S]*?)<\/code\s*>/gi, (_match, body) => {
    const code = stripHtml(body);
    if (code) codeParts.push(code);
    return ' ';
  });

  return {
    text: stripHtml(remaining),
    code: normalizeWhitespace(codeParts.join(' '))
  };
}

function readIdAttribute(attributes) {
  const match = String(attributes || '').match(
    /\bid\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i
  );
  return decodeEntities(match?.[1] ?? match?.[2] ?? match?.[3] ?? '').trim();
}

function getBodyHtml(html) {
  const match = String(html).match(/<body\b[^>]*>([\s\S]*?)<\/body\s*>/i);
  return match ? match[1] : html;
}

function extractHtmlSections(html) {
  const body = removeIgnoredBlocks(getBodyHtml(html));
  const headingPattern = /<h([1-6])\b([^>]*)>([\s\S]*?)<\/h\1\s*>/gi;
  const sections = [];
  let current = { heading: '', anchor: '', text: '', code: '' };
  let cursor = 0;

  const appendFragment = fragment => {
    const extracted = extractTextAndCode(fragment);
    current.text = normalizeWhitespace([current.text, extracted.text].filter(Boolean).join(' '));
    current.code = normalizeWhitespace([current.code, extracted.code].filter(Boolean).join(' '));
  };

  const flush = () => {
    if (current.heading || current.text || current.code) sections.push(current);
  };

  for (const match of body.matchAll(headingPattern)) {
    appendFragment(body.slice(cursor, match.index));
    flush();

    current = {
      heading: stripHtml(match[3]),
      anchor: readIdAttribute(match[2]),
      text: '',
      code: ''
    };
    cursor = match.index + match[0].length;
  }

  appendFragment(body.slice(cursor));
  flush();
  return sections;
}

function getSlideSources(html) {
  const sources = [];
  const seen = new Set();
  const pattern = /\bdata-slide-source\s*=\s*(?:"([^"]+)"|'([^']+)')/gi;

  for (const match of String(html).matchAll(pattern)) {
    const source = (match[1] || match[2] || '').trim();
    if (!source || seen.has(source)) continue;
    if (!/^[A-Za-z0-9_-]+$/.test(source)) {
      throw new Error(`スライド原本ID「${source}」は検索索引に使用できません。`);
    }
    seen.add(source);
    sources.push(source);
  }
  return sources;
}

async function extractSlideSections(source) {
  const slidePath = path.join(projectRoot, 'data', 'slides', `${source}.json`);
  assertInsideProject(slidePath, 'スライドデータ');
  const payload = JSON.parse(await readFile(slidePath, 'utf8'));

  if (payload.schemaVersion !== 1 || payload.source !== source || !Array.isArray(payload.slides)) {
    throw new Error(`data/slides/${source}.jsonの形式が不正です。`);
  }

  const sections = [];
  let parentHeading = '';
  let parentAnchor = '';
  let headlineNumber = 0;

  for (const entry of payload.slides) {
    if (!entry || typeof entry !== 'object') continue;

    if (typeof entry.section === 'string' && entry.section.trim()) {
      parentHeading = normalizeWhitespace(entry.section);
      parentAnchor = `headline_${++headlineNumber}`;
      sections.push({
        heading: parentHeading,
        anchor: parentAnchor,
        text: '',
        code: ''
      });
      continue;
    }

    if (Object.prototype.hasOwnProperty.call(entry, 'slideTitle')) continue;
    if (typeof entry.title !== 'string' || !entry.title.trim()) continue;

    const extracted = extractTextAndCode(entry.note || '');
    sections.push({
      heading: normalizeWhitespace(entry.title),
      anchor: parentAnchor,
      text: normalizeWhitespace([
        parentHeading,
        extracted.text,
        typeof entry.imageAlt === 'string' ? entry.imageAlt : ''
      ].filter(Boolean).join(' ')),
      code: extracted.code
    });
  }

  return sections;
}

function readPages(source) {
  const context = { window: {} };
  vm.runInNewContext(source, context, {
    filename: 'js/pages.js',
    timeout: 1000
  });

  if (!context.window.pages || typeof context.window.pages !== 'object') {
    throw new Error('js/pages.jsからwindow.pagesを読み取れません。');
  }
  return context.window.pages;
}

function normalizePageUrl(fileName) {
  return String(fileName || '').trim().replace(/^\.\//, '');
}

function isExcludedPage(page, url) {
  const normalizedId = String(page.id || '').trim().toLowerCase();
  const normalizedUrl = url.toLowerCase();
  const baseName = path.posix.basename(normalizedUrl);

  return EXCLUDED_PAGE_IDS.has(normalizedId) ||
    EXCLUDED_PATH_PREFIXES.some(prefix => normalizedUrl.startsWith(prefix)) ||
    /^(?:sample|answer)[^/]*\.html?$/.test(baseName);
}

async function buildDocuments(pages) {
  const documents = [];
  const seenUrls = new Set();

  for (const page of Object.values(pages)) {
    if (!page || page.release !== true) continue;

    const url = normalizePageUrl(page.fileName);
    if (!url || !/\.html?$/i.test(url) || seenUrls.has(url) || isExcludedPage(page, url)) continue;

    const htmlPath = path.resolve(projectRoot, url);
    assertInsideProject(htmlPath, `教材ページ ${page.id}`);
    const html = await readFile(htmlPath, 'utf8');
    const sections = extractHtmlSections(html);

    for (const source of getSlideSources(html)) {
      sections.push(...await extractSlideSections(source));
    }

    documents.push({
      id: String(page.id || '').trim(),
      url,
      title: normalizeWhitespace(page.title || page.id || url),
      course: COURSE_KEYS.get(page.mainTitle) || 'other',
      courseLabel: normalizeWhitespace(page.mainTitle || 'その他'),
      category: normalizeWhitespace(page.category || ''),
      detail: normalizeWhitespace(page.detail || ''),
      sections: sections.length
        ? sections
        : [{ heading: '', anchor: '', text: '', code: '' }]
    });
    seenUrls.add(url);
  }

  return documents.sort((a, b) => a.url < b.url ? -1 : a.url > b.url ? 1 : 0);
}

async function buildIndex() {
  const pagesSource = await readFile(pagesPath, 'utf8');
  const documents = await buildDocuments(readPages(pagesSource));
  const sourceHash = createHash('sha256')
    .update(JSON.stringify(documents))
    .digest('hex');

  return {
    schemaVersion: 1,
    sourceHash,
    documents
  };
}

async function main() {
  const index = await buildIndex();
  const expected = `${JSON.stringify(index)}\n`;
  let actual = null;

  try {
    actual = await readFile(outputPath, 'utf8');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }

  if (checkOnly) {
    if (actual !== expected) {
      console.error('検索索引が教材の現在内容と一致しません。generate-search-index.mjsを実行してください。');
      process.exitCode = 1;
      return;
    }
    console.log(`検索索引確認: OK（${index.documents.length}ページ、${Buffer.byteLength(expected)} bytes）`);
    return;
  }

  if (actual === expected) {
    console.log(`検索索引生成: 変更なし（${index.documents.length}ページ）`);
    return;
  }

  await writeFile(outputPath, expected, 'utf8');
  console.log(`検索索引生成: 更新（${index.documents.length}ページ、${Buffer.byteLength(expected)} bytes）`);
}

await main();
