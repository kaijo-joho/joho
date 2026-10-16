// 表示だけの検証。Google・採点・提出へ接続せず、正本を更新しない。
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createEditorServer } from './serve-pythoneditor.mjs';
const { chromium, webkit } = createRequire(import.meta.url)('playwright');
const rowsFile = process.env.PYTHONEDITOR_PROMPT_ROWS;
const rows = rowsFile ? JSON.parse(await readFile(rowsFile, 'utf8')) : [
  ['example-1','example',1,'v1','表示の確認','#**9-1. 表示** 基本問題\n\n#**問1 出力**\n\n共通の説明です。\n\n##**(1) 表示の確認**\n\n本文です。\n\n```python\n#nospaces\nprint(1)\n```\n\n#### 入出力例\n> 1\n\n提出時の注意です。'],
  ['example-2','example',2,'v1','解法B','#**9-1. 表示** 基本問題\n\n#**問1 出力**\n\n##**(2) range(a)を使う場合**\n\n異なる条件は省かないでください。']
];
const original = JSON.stringify(rows), sets = new Map();
for (const row of rows) {
  if (!sets.has(row[1])) sets.set(row[1], { setId: row[1], title: row[1], questions: [] });
  sets.get(row[1]).questions.push({ questionId: row[0], setId: row[1], version: row[3], title: row[4], prompt: row[5], templateCode: '', setupCode: '' });
}
const catalog = { schema: 'python-editor-catalog-v1', label: '問題文の表示確認', sets: [...sets.values()] };
const engine = process.env.PYTHONEDITOR_ENGINE || 'Chrome', evidence = process.env.PYTHONEDITOR_PROMPT_EVIDENCE || '/private/tmp/pythoneditor-prompt-browser';
await mkdir(evidence, { recursive: true });
const report = { engine, environment: 'local browser; supplied prompt snapshot or synthetic text; no Google or grading connection', sets: sets.size, questions: rows.length, checks: [], errors: [] };
const check = name => { report.checks.push(name); console.log('PASS', name); };
const server = await createEditorServer({ isolate: false });
const browser = engine === 'webkit' ? await webkit.launch() : await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } }), page = await context.newPage();
page.on('pageerror', error => report.errors.push(error.message));
await page.route('**/__pythoneditor/catalog', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify(catalog) }));
// WebKitの履歴更新上限を越える機械的な連打を避け、実際の選択速度で確認する。
const chooseSet = async id => { await page.waitForTimeout(150); await page.locator('#set-trigger').click(); await page.locator('#set-menu button[data-set="' + id + '"]').click(); };
const chooseQuestion = async id => { await page.waitForTimeout(150); await page.locator('#question-list button[data-question="' + id + '"]').click(); };
try {
  await page.goto(server.url); await page.waitForSelector('#question-list button');
  let visited = 0;
  for (const set of catalog.sets) {
    await chooseSet(set.setId);
    for (const q of set.questions) {
      await chooseQuestion(q.questionId);
      const actual = await page.evaluate(async q => {
        const { renderPrompt } = await import('/tools/pythoneditor/prompt.mjs');
        const baseline = document.createElement('div'); renderPrompt(baseline, q.prompt);
        const body = document.getElementById('prompt');
        const protectedContent = element => [...element.querySelectorAll('p,pre,blockquote,table,details,li')].map(node => ({ tag: node.tagName, text: node.textContent }));
        return { header: document.getElementById('question-title').textContent, body: body.textContent,
          before: protectedContent(baseline), after: protectedContent(body),
          headings: [...body.querySelectorAll('h1,h2,h3,h4,h5,h6')].map(node => node.textContent),
          groupHeadings: [...document.querySelectorAll('#question-list .question-group>h3')].map(node => node.textContent) };
      }, q);
      assert.ok(actual.header.includes(q.title), q.questionId + ': question title retained');
      assert.ok(actual.body.trim(), q.questionId + ': nonempty body');
      assert.deepEqual(actual.after, actual.before, q.questionId + ': instructions/code/examples/lists retained');
      assert.ok(!actual.headings.some(h => /^問\s*[0-9０-９]+/.test(h)), q.questionId + ': major heading moved to navigation');
      assert.ok(actual.groupHeadings.length > 0, q.questionId + ': major heading visible');
      visited++;
    }
  }
  assert.equal(visited, rows.length); assert.equal(JSON.stringify(rows), original);
  check('全問題で元データを変えず、本文・コード例・入出力例・共通説明を保持する');
  const firstSet = catalog.sets[0], first = firstSet.questions[0];
  await chooseSet(firstSet.setId); await chooseQuestion(first.questionId);
  assert.match(await page.locator('#question-title').textContent(), /^問1 \(1\)/);
  assert.ok(!(await page.locator('#prompt').textContent()).includes('9-1. 表示 基本問題'));
  await page.screenshot({ path: evidence + '/first-question.png', fullPage: true });
  check('セット名・大問・小問の重複を整理し、小問のタイトルを枠の上へ表示する');
  const edit = '# 表示確認の下書き\nprint(1)\n';
  await page.evaluate(code => document.querySelector('.CodeMirror').CodeMirror.setValue(code), edit);
  const other = firstSet.questions[1];
  if (other) { await chooseQuestion(other.questionId); await chooseQuestion(first.questionId); }
  await page.reload(); await page.waitForSelector('#question-list button');
  assert.equal(await page.evaluate(() => document.querySelector('.CodeMirror').CodeMirror.getValue()), edit);
  check('問題切替と再読み込みで同じ問題・版の下書きを保持する');
  const longest = catalog.sets.flatMap(s => s.questions).reduce((a, b) => a.title.length > b.title.length ? a : b);
  await chooseSet(longest.setId); await chooseQuestion(longest.questionId);
  for (const width of [1440,720,390]) for (const theme of ['auto','light','dark']) for (const size of ['standard','large','largest']) {
    await page.setViewportSize({ width, height: 1000 });
    await page.evaluate(({theme,size}) => { for (const [id,value] of [['theme',theme],['text-size',size]]) { const el = document.getElementById(id); el.value = value; el.dispatchEvent(new Event('change', { bubbles: true })); } }, {theme,size});
    const bounds = await page.evaluate(() => ({ overflow: document.documentElement.scrollWidth > innerWidth + 1, titleRight: document.getElementById('question-title').getBoundingClientRect().right, width: innerWidth }));
    assert.equal(bounds.overflow, false, JSON.stringify({width,theme,size,bounds})); assert.ok(bounds.titleRight <= width + 1);
  }
  check('最長の問題名も27種類の幅・テーマ・文字サイズで枠内に収まる');
  assert.equal(await page.locator('#formal-submit').isDisabled(), true); assert.deepEqual(report.errors, []);
  check('表示整理から正式採点・提出を有効化しない');
  report.passed = true;
} catch (error) { report.failure = error.stack; await page.screenshot({ path: evidence + '/failure.png', fullPage: true }).catch(() => {}); throw error; }
finally { await writeFile(evidence + '/summary.json', JSON.stringify(report, null, 2) + '\n'); await browser.close(); await new Promise(resolve => server.server.close(resolve)); }
console.log(JSON.stringify({ passed: report.checks.length, sets: sets.size, questions: rows.length, evidence }));
