import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import vm from 'node:vm';

class FakeElement {
  constructor(tagName) {
    this.tagName = tagName.toUpperCase();
    this.children = [];
    this.attributes = {};
    this.dataset = {};
    this.textContent = '';
  }

  appendChild(child) {
    this.children.push(child);
    return child;
  }

  append(...children) {
    this.children.push(...children);
  }

  replaceChildren(...children) {
    this.children = [...children];
  }

  setAttribute(name, value) {
    this.attributes[name] = String(value);
  }
}

function descendants(node) {
  return node.children.flatMap(child =>
    child instanceof FakeElement ? [child, ...descendants(child)] : []
  );
}

const [layoutSource, dockSource, pageSource] = await Promise.all([
  readFile(new URL('../js/script.js', import.meta.url), 'utf8'),
  readFile(new URL('../js/lesson_dock.js', import.meta.url), 'utf8'),
  readFile(new URL('../js/script_pages.js', import.meta.url), 'utf8')
]);

const worksheetItems = [
  { id: 'ws-valid', title: '3-1 ワークシート', release: true, url: ' https://example.test/ws?id=valid ' },
  { id: 'ws-legacy', title: '公開指定省略', url: 'https://example.test/ws?id=legacy' },
  { id: 'ws-hidden', title: '非公開', release: false, url: 'https://example.test/ws?id=hidden' },
  { id: 'ws-empty', title: '空URL', release: true, url: '   ' },
  { id: 'ws-missing', title: 'URL欠落', release: true }
];

{
  const document = {
    baseURI: 'https://example.test/joho/dr31.html',
    currentScript: { src: 'https://example.test/joho/js/script.js' },
    readyState: 'loading',
    addEventListener() {},
    createElement: tag => new FakeElement(tag)
  };
  const context = {
    URL,
    window: {
      pages: {
        dr31: {
          id: 'dr31',
          worksheetApp: worksheetItems
        }
      }
    },
    location: new URL(document.baseURI),
    document
  };
  const instrumented = layoutSource.replace(
    'window.isPageLinkReleased = isPageLinkReleased;',
    'window.isPageLinkReleased = isPageLinkReleased; window.__worksheetTest = { releasedItems, createFileList };'
  );
  vm.runInNewContext(instrumented, context, { filename: 'js/script.js', timeout: 1000 });

  const released = context.window.__worksheetTest.releasedItems('worksheetApp');
  assert.equal(released.length, 2, '表紙では公開済みかつURLがあるワークシートだけを扱う');

  const { ul } = context.window.__worksheetTest.createFileList(
    released,
    'worksheetApp',
    { worksheetApp: true }
  );
  const links = descendants(ul).filter(node => node.tagName === 'A');
  assert.equal(links.length, 2, '公開ワークシートごとにリンクを作る');
  assert.equal(links[0].textContent, 'ワークシートを開く（印刷・解答・解説）');
  assert.equal(links[0].target, '_blank');
  assert.equal(links[0].rel, 'noopener');
  assert.equal(links[0].attributes.download, undefined, 'GASリンクへdownload属性を付けない');
  assert.equal(
    links[0].attributes['aria-label'],
    '3-1 ワークシート：ワークシートを開く（印刷・解答・解説）'
  );
}

{
  const context = {
    URL,
    console,
    window: {
      FAQ_DATA: [],
      FAQ_CATEGORY_DATA: [],
      SITE_CONFIG: {
        fileBase: 'https://example.test/file?target=',
        lessonDock: { strictUrl: true, enableFallback: true }
      },
      isPageLinkReleased: () => true
    },
    location: new URL('https://example.test/joho/dr31.html'),
    document: {
      querySelector: () => null,
      createElement: tag => new FakeElement(tag),
      createTextNode: value => String(value)
    }
  };
  const instrumented = dockSource.replace(
    'window.initLessonDockFromPages = initLessonDockFromPages;',
    'window.__worksheetTest = { buildLessonDockModel, secWorksheet }; window.initLessonDockFromPages = initLessonDockFromPages;'
  );
  vm.runInNewContext(instrumented, context, { filename: 'js/lesson_dock.js', timeout: 1000 });

  const model = context.window.__worksheetTest.buildLessonDockModel(
    {
      worksheetApp: worksheetItems,
      practiceFile: [{ id: 'practice-fallback', title: '既存フォールバック' }]
    },
    {},
    'dr31'
  );
  assert.equal(model.worksheet.length, 2, 'LessonDockも公開済みかつURLがある項目だけを扱う');
  assert.equal(model.worksheet[0].url, 'https://example.test/ws?id=valid', 'URL前後の空白を除く');
  assert.ok(
    !model.worksheet.some(item => item.id === 'ws-empty' || item.id === 'ws-missing'),
    'ワークシートはIDから別種の配付URLへフォールバックしない'
  );
  assert.equal(
    model.practicefile[0].url,
    'https://example.test/file?target=practice-fallback',
    '既存ファイルの設定済みフォールバックは維持する'
  );

  const section = context.window.__worksheetTest.secWorksheet('ワークシート', model.worksheet);
  const links = descendants(section).filter(node => node.tagName === 'A');
  assert.equal(links.length, 2, 'LessonDockにも公開ワークシートごとのリンクを作る');
  assert.equal(links[0].children[0], 'ワークシートを開く（印刷・解答・解説）');
  assert.equal(links[0].attributes.target, '_blank');
  assert.equal(links[0].attributes.rel, 'noopener');
  assert.equal(
    links[0].attributes['aria-label'],
    '3-1 ワークシート：ワークシートを開く（印刷・解答・解説）'
  );
}

{
  const container = new FakeElement('section');
  container.dataset.fileList = 'courseResources';
  const context = {
    URL,
    window: {},
    location: new URL('https://example.test/joho/dr00.html'),
    document: {
      getElementById: id => id === 'section_filelist' ? container : null,
      createElement: tag => new FakeElement(tag)
    }
  };
  vm.runInNewContext(pageSource, context, { filename: 'js/script_pages.js', timeout: 1000 });

  const pages = {
    dr00: { id: 'dr00', mainTitle: 'デジタル表現', release: true },
    dr31: {
      id: 'dr31',
      mainTitle: 'デジタル表現',
      title: '音のデジタル表現',
      category: '音',
      release: true,
      worksheetApp: worksheetItems
    }
  };
  const groups = context.getCourseResourceGroups(pages, 'dr00');
  assert.equal(groups.length, 1);
  assert.equal(groups[0].pages[0].resources[0].key, 'worksheetApp');
  assert.equal(groups[0].pages[0].resources[0].items.length, 2, '講座一覧も同じ公開条件で絞り込む');

  context.renderCourseResourceIndex(pages, 'dr00');
  const links = descendants(container).filter(node => node.tagName === 'A');
  const worksheetLinks = links.filter(node =>
    node.textContent === 'ワークシートを開く（印刷・解答・解説）'
  );
  assert.equal(worksheetLinks.length, 2, '講座一覧にGASワークシートの用途を明示する');
  assert.ok(worksheetLinks.every(link => link.target === '_blank' && link.rel === 'noopener'));
  assert.equal(
    worksheetLinks[0].attributes['aria-label'],
    '3-1 ワークシート：ワークシートを開く（印刷・解答・解説）'
  );
}

await assert.rejects(access(new URL('../dr31_ws.html', import.meta.url)), { code: 'ENOENT' }, '校了後の静的試作は再公開しない');
await Promise.all(['dr31.html', 'dr32.html'].map(name => access(new URL('../' + name, import.meta.url))));

console.log('worksheet-links: 表紙・LessonDock・講座一覧の公開条件、リンク表示、試作撤去に合格');
