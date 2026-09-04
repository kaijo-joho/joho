import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDirectory, '..');
const require = createRequire(import.meta.url);
const core = require(path.join(projectRoot, 'js', 'site_search_core.js'));
const index = JSON.parse(await readFile(path.join(projectRoot, 'data', 'search-index.json'), 'utf8'));

assert.equal(Object.hasOwn(globalThis, '__siteSearchCore'), false);
assert.equal(core.normalizeText('  ＰＬＴ．ＰＬＯＴ\n'), 'plt.plot');
assert.deepEqual(core.tokenize(' IF　文 if '), ['if', '文']);
const kanaRanges = core.findMatchRanges('半角のｶﾞを全角のガへ', ['ガ']);
assert.deepEqual(kanaRanges.map(range => '半角のｶﾞを全角のガへ'.slice(range.start, range.end)), ['ｶﾞ', 'ガ']);

const synthetic = [
  {
    id: 'title',
    title: '配列の探索',
    course: 'py',
    detail: '',
    category: '',
    sections: [{ heading: '', text: '', code: '' }]
  },
  {
    id: 'body',
    title: '本文一致',
    course: 'py',
    detail: '',
    category: '',
    sections: [{ heading: '', text: '配列の探索を説明します', code: '' }]
  },
  {
    id: 'code',
    title: 'コード一致',
    course: 'py',
    detail: '',
    category: '',
    sections: [{ heading: '', text: '', code: '# 配列の探索' }]
  },
  {
    id: 'split',
    title: '複数語',
    course: 'html',
    detail: '',
    category: '',
    sections: [
      { heading: 'HTML', text: '', code: '' },
      { heading: '', text: 'リンクを作成します', code: '' }
    ]
  },
  {
    id: 'case',
    title: 'plt.plotの例',
    course: 'py',
    detail: '',
    category: '',
    sections: [{ heading: '', text: '', code: '' }]
  }
];

assert.deepEqual(
  core.searchDocuments(synthetic, '配列 探索').map(result => result.document.id),
  ['title', 'body', 'code']
);
assert.deepEqual(
  core.searchDocuments(synthetic, 'html リンク').map(result => result.document.id),
  ['split']
);
assert.deepEqual(
  core.searchDocuments(synthetic, 'ＰＬＴ．ＰＬＯＴ').map(result => result.document.id),
  ['case']
);
assert.equal(core.searchDocuments(synthetic, 'html リンク', { course: 'py' }).length, 0);

const mappedRanges = core.findMatchRanges('<img onerror="x"> ＰＬＴ．ＰＬＯＴ', ['plt.plot']);
assert.equal(mappedRanges.length, 1);
assert.equal('<img onerror="x"> ＰＬＴ．ＰＬＯＴ'.slice(mappedRanges[0].start, mappedRanges[0].end), 'ＰＬＴ．ＰＬＯＴ');

assert.ok(core.validateIndex(index));
assert.match(index.sourceHash, /^[a-f0-9]{64}$/);
assert.ok(index.documents.length >= 60);
assert.equal(new Set(index.documents.map(document => document.url)).size, index.documents.length);

const excludedIds = new Set(['color', 'faq', 'gfe', 'link', 'print', 'test']);
for (const document of index.documents) {
  assert.ok(!excludedIds.has(document.id), `除外対象が索引に含まれています: ${document.id}`);
  assert.ok(!document.url.includes('/answer'), `配付用解答が索引に含まれています: ${document.url}`);
  assert.ok(!document.url.startsWith('archive/'));
  assert.ok(!document.url.startsWith('teacher-tools/'));
  assert.ok(!document.url.startsWith('test/'));
  assert.ok(!document.url.startsWith('html/'));
  assert.ok(!/(^|\/)(sample|answer)[^/]*\.html?$/i.test(document.url));
}

const plotResults = core.searchDocuments(index.documents, 'plt.plot');
assert.equal(plotResults[0]?.document.id, 'py51');
assert.ok(plotResults.some(result => result.document.id === 'py52'));

const slideResults = core.searchDocuments(index.documents, '版の復元');
assert.equal(slideResults[0]?.document.id, 'ss11');
assert.equal(slideResults[0]?.section.heading, '2.5. 版の復元');

const soundResults = core.searchDocuments(index.documents, '量子化', { course: 'dr' });
assert.equal(soundResults.some(result => result.document.id === 'dr31'), false);
assert.equal(soundResults.some(result => result.document.id === 'dr32'), false);
assert.equal(soundResults.some(result => result.document.id === 'dr33'), false);
assert.equal(soundResults.every(result => result.document.course === 'dr'), true);

assert.equal(core.searchDocuments(index.documents, '開始前に戻す').length, 0);

const faqUrl = new URL(core.buildFaqUrl(
  'https://joho.kaijo.ed.jp/py42.html',
  ' left + right ',
  'py'
));
assert.equal(faqUrl.pathname, '/faq.html');
assert.equal(faqUrl.searchParams.get('q'), 'left + right');
assert.equal(faqUrl.searchParams.get('course'), 'py');
assert.match(faqUrl.href, /[?&]q=left\+%2B\+right(?:&|$)/);
assert.match(faqUrl.href, /[?&]course=py(?:&|$)/);

const invalidCourseUrl = new URL(core.buildFaqUrl(
  'https://joho.kaijo.ed.jp/index.html',
  '<script>alert(1)</script>',
  'invalid'
));
assert.equal(invalidCourseUrl.searchParams.get('q'), '<script>alert(1)</script>');
assert.equal(invalidCourseUrl.searchParams.has('course'), false);

const uiSource = await readFile(path.join(projectRoot, 'js', 'site_search.js'), 'utf8');
assert.equal(
  /\b(?:innerHTML|outerHTML|insertAdjacentHTML|document\.write)\b/.test(uiSource),
  false,
  '検索UIは検索語や索引内容をHTML文字列としてDOMへ渡さない'
);
assert.deepEqual(
  Array.from(uiSource.matchAll(/\bwindow\.([A-Za-z]\w*)\s*=/g), match => match[1]).sort(),
  ['initSiteSearch', 'openSiteSearch']
);

const faqPageSource = await readFile(path.join(projectRoot, 'js', 'faq_page.js'), 'utf8');
assert.equal(/faqBotUrl\.searchParams\.set\(\s*['"]q['"]/.test(faqPageSource), false);
assert.equal(/returnUrl\.searchParams\.set\(\s*['"]q['"]/.test(faqPageSource), false);

console.log(`サイト内検索テスト: OK（${index.documents.length}ページ）`);
