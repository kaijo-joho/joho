const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const test = require('node:test');

const guidePath = resolve(__dirname, '../help/USER_GUIDE.md');
let guideConditionBlocks;
test.before(async () => {
  ({ guideConditionBlocks } = await import('../../../help-desk/preview/core.mjs'));
});

test('reads the four practice prerequisites from the existing format-2 guide', () => {
  const source = readFileSync(guidePath, 'utf8').split('## 2. 利用条件\n')[1].split('\n## 3.')[0];
  const [list, ...rest] = guideConditionBlocks(source);
  assert.deepEqual(list.entries.map(([term]) => term), [
    '対応環境', '必要なアカウント', '対象となる利用モード', '利用を始める前の条件',
  ]);
  assert.ok(list.entries.every(([, description]) => description.length > 0));
  assert.deepEqual(rest, []);
});

test('preserves prose around tables and retains cell values as text', () => {
  const source = [
    'はじめの説明',
    '',
    '| 項目 | 内容 |',
    '| :--- | ---: |',
    '| 文字 | A\\|B と <b>見本</b> |',
    '',
    '途中の説明',
    '| 項目 | 内容 |',
    '| --- | --- |',
    '| 画面 | 編集エリア |',
    '| 項目 | 内容 |',
    '| --- | --- |',
    '| 操作 | クリック |',
    '',
    '最後の説明',
    '',
    '追加の段落',
  ].join('\r\n');
  assert.deepEqual(guideConditionBlocks(source), [
    { text: 'はじめの説明' },
    { entries: [['文字', 'A|B と <b>見本</b>']] },
    { text: '途中の説明' },
    { entries: [['画面', '編集エリア']] },
    { entries: [['操作', 'クリック']] },
    { text: '最後の説明\n\n追加の段落' },
  ]);
});

test('keeps non-table sections and unsupported table formats intact', () => {
  const source = '学校アカウントを使います。\n\n| 項目 | 内容 | 例 |\n| --- | --- | --- |\n| 種類 | A | B |';
  assert.deepEqual(guideConditionBlocks(source), [{ text: source }]);
  assert.deepEqual(guideConditionBlocks(''), []);
});

test('the embedded practice guide matches its source and leaves the standalone guide revision intact', async () => {
  const { htmlPracticeGuide } = await import('../../../help-desk/preview/html-practice-guide.mjs');
  const { draftGuides } = await import('../../../help-desk/preview/draft-guides.mjs');
  const { validateGuide } = await import('../../../help-desk/preview/core.mjs');
  const { embedGuide } = await import('../../../help-desk/preview/embed-bridge.mjs');
  validateGuide(htmlPracticeGuide);
  assert.equal(htmlPracticeGuide.source_sha256, createHash('sha256').update(readFileSync(guidePath)).digest('hex'));
  const request = { appId: 'htmleditor', appVersion: '0.11.4', guideRevision: 3 };
  assert.equal(embedGuide(request, htmlPracticeGuide).operationIds.size, Object.keys(htmlPracticeGuide.operations).length);
  assert.equal(draftGuides.htmleditor.guide_revision, 2);
  assert.equal(embedGuide(request, draftGuides.htmleditor), null);
});
