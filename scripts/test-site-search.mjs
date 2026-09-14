import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDirectory, '..');
const require = createRequire(import.meta.url);
const core = require(path.join(projectRoot, 'js', 'site_search_core.js'));
const index = JSON.parse(await readFile(path.join(projectRoot, 'data', 'search-index.json'), 'utf8'));
const faqContext = {
  window: {},
  URL,
  document: {
    createElement(tag) {
      assert.equal(tag, 'template', 'FAQ検索はHTML本文をtemplateでテキスト化する');
      return {
        content: { textContent: '' },
        set innerHTML(value) {
          this.content.textContent = String(value || '').replace(/<[^>]*>/g, ' ');
        }
      };
    }
  }
};
vm.createContext(faqContext);
vm.runInContext(await readFile(path.join(projectRoot, 'js', 'faq.js'), 'utf8'), faqContext, {
  filename: 'js/faq.js',
  timeout: 1000
});
vm.runInContext(await readFile(path.join(projectRoot, 'js', 'faq_shared.js'), 'utf8'), faqContext, {
  filename: 'js/faq_shared.js',
  timeout: 1000
});
const siteFaq = faqContext.window.siteFaq;
const pagesContext = { window: {} };
vm.runInNewContext(await readFile(path.join(projectRoot, 'js', 'pages.js'), 'utf8'), pagesContext, {
  filename: 'js/pages.js',
  timeout: 1000
});
const pages = pagesContext.window.pages;

assert.equal(Object.hasOwn(globalThis, '__siteSearchCore'), false);
assert.deepEqual(Array.from(siteFaq.COURSE_KEYS), ['il', 'html', 'ss', 'py']);
assert.equal(siteFaq.normalizeForSearch('  ＰＬＴ．ＰＬＯＴ\n'), 'plt.plot');
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

const syntheticFaqs = [
  {
    faqId: 'public-split', status: '公開', course: 'py', unit: '基礎', category: 'トラブル',
    question: 'インデントの確認', shortAnswer: '', bodyHtml: '<p>エラーを確認する</p>', keywords: ['空白'], priority: 2, sortOrder: 2
  },
  {
    faqId: 'public-nfkc', status: '公開', course: 'py', unit: '基礎', category: 'トラブル',
    question: 'ＰＬＴ．ＰＬＯＴ', shortAnswer: '', bodyHtml: '', keywords: ['グラフ'], priority: 1, sortOrder: 1
  },
  {
    faqId: 'public-other-course', status: '', course: 'html', unit: '基礎', category: 'タグ',
    question: 'インデントエラー', shortAnswer: '', bodyHtml: '', keywords: ['空白'], priority: 1, sortOrder: 1
  },
  {
    faqId: 'draft', status: '下書き', course: 'py', unit: '基礎', category: 'トラブル',
    question: 'インデントエラー', shortAnswer: '', bodyHtml: '', keywords: ['空白'], priority: 0, sortOrder: 0
  }
];
const faqState = { q: 'インデント エラー', course: 'py', unit: '', category: '', keyword: '' };
assert.deepEqual(
  Array.from(siteFaq.applyFilters(syntheticFaqs, faqState), faq => faq.faqId),
  ['public-split'],
  '複数語はquestionとbodyHtmlに分かれていてもAND検索する。下書きと他講座は含めない'
);
assert.deepEqual(
  Array.from(siteFaq.applyFilters(syntheticFaqs, { ...faqState, q: 'ｐｌｔ．ｐｌｏｔ', course: '', category: 'トラブル' }), faq => faq.faqId),
  ['public-nfkc'],
  'NFKCと大小文字吸収の後にカテゴリ絞り込みする'
);
assert.deepEqual(
  Array.from(siteFaq.applyFilters(syntheticFaqs, { ...faqState, q: '', keyword: '空白', unit: '基礎', category: 'トラブル' }), faq => faq.faqId),
  ['public-split'],
  'キーワード・単元・カテゴリ絞り込みを保持する'
);
const indentationFaqs = Array.from(siteFaq.applyFilters(faqContext.window.FAQ_DATA, {
  q: 'インデント エラー', course: 'py', unit: '', category: '', keyword: ''
}));
assert.ok(indentationFaqs.some(faq => faq.faqId === 'py-007'), '「インデント エラー」から関連FAQが見つかる');

const faqBotUrl = new URL(siteFaq.buildFaqBotUrl(
  { course: 'py', q: 'インデント エラー' },
  { baseUrl: 'https://joho.kaijo.ed.jp/py21.html?q=%E7%A7%98%E5%AF%86#result', pageKey: 'py21' }
));
assert.equal(faqBotUrl.searchParams.get('course'), 'py');
assert.equal(faqBotUrl.searchParams.get('page'), 'py21');
assert.equal(faqBotUrl.searchParams.has('q'), false);
const faqBotReturnUrl = new URL(faqBotUrl.searchParams.get('returnUrl'));
assert.equal(faqBotReturnUrl.pathname, '/py21.html');
assert.equal(faqBotReturnUrl.search, '');
assert.equal(faqBotReturnUrl.hash, '');
assert.equal(faqBotReturnUrl.searchParams.has('q'), false);
assert.equal(new URL(siteFaq.buildFaqBotUrl({}, {
  baseUrl: 'https://joho.kaijo.ed.jp/faq.html?q=%E7%A7%98%E5%AF%86#result', pageKey: '<invalid>'
})).searchParams.get('page'), 'faq');

assert.ok(core.validateIndex(index));
assert.match(index.sourceHash, /^[a-f0-9]{64}$/);
assert.ok(index.documents.length >= 60);
assert.equal(new Set(index.documents.map(document => document.url)).size, index.documents.length);

const excludedIds = new Set(['color', 'faq', 'gfe', 'link', 'print', 'test']);
for (const document of index.documents) {
  assert.equal(pages[document.id]?.release, true, `未公開ページを索引へ含めない: ${document.id}`);
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
assert.equal(soundResults.some(result => result.document.id === 'dr31'), true);
assert.equal(soundResults.some(result => result.document.id === 'dr32'), true);
assert.equal(soundResults.some(result => result.document.id === 'dr33'), false);
assert.equal(soundResults.every(result => result.document.course === 'dr'), true);

for (const id of ['dr00', 'dr31', 'dr32', 'cp00', 'cp31', 'cp32', 'lc02', 'nw00', 'nw11', 'nw12', 'nw13']) {
  const document = index.documents.find(document => document.id === id);
  assert.ok(pages[id], `座学ページの掲載設定が存在する: ${id}`);
  assert.equal(Boolean(document), pages[id].release === true, `座学ページの掲載設定に従う: ${id}`);
  if (document) {
    const course = pages[id].mainTitle === 'コンピュータのしくみ' ? 'cp' : id.slice(0, 2);
    assert.equal(document.course, course, `座学シリーズで絞り込める: ${id}`);
  }
}
for (const [course, query, id] of [['cp', '回路', 'cp31'], ['nw', 'プロトコル', 'nw11']]) {
  const results = core.searchDocuments(index.documents, query, { course });
  assert.equal(results.some(result => result.document.id === id), pages[id].release === true, `公開した${course}の教材が見つかる`);
  assert.ok(results.every(result => result.document.course === course), `${course}以外を含めない`);
  assert.equal(core.searchDocuments(index.documents, 'plt.plot', { course }).length, 0);
  assert.equal(new URL(core.buildFaqUrl('https://joho.kaijo.ed.jp/', query, course)).searchParams.has('course'), false);
}

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
const faqSharedSource = await readFile(path.join(projectRoot, 'js', 'faq_shared.js'), 'utf8');
assert.equal(/faqBotUrl\.searchParams\.set\(\s*['"]q['"]/.test(faqPageSource), false);
assert.equal(/returnUrl\.searchParams\.set\(\s*['"]q['"]/.test(faqPageSource), false);
assert.equal(/faqBotUrl\.searchParams\.set\(\s*['"]q['"]/.test(faqSharedSource), false);
assert.equal(/returnUrl\.searchParams\.set\(\s*['"]q['"]/.test(faqSharedSource), false);

for (const course of ['dr', 'lc', 'nw']) {
  const url = new URL(faqContext.window.siteFaq.buildFaqBotUrl({ course, q: '引き継がない語' }, {
    baseUrl: 'https://joho.kaijo.ed.jp/py21.html?q=引き継がない語#位置', pageKey: 'py21'
  }));
  assert.equal(url.searchParams.get('course'), course, 'AIには選択中の座学講座を渡す');
  assert.equal(url.searchParams.get('page'), 'py21');
  assert.equal(new URL(url.searchParams.get('returnUrl')).search, '');
  assert.equal(url.href.includes(encodeURIComponent('引き継がない語')), false);
}

console.log(`サイト内検索テスト: OK（${index.documents.length}ページ）`);
