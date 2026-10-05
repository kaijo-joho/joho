const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const diagnostics = require('../diagnostics.js');

const repo = path.resolve(__dirname, '../../..');
const fixtureIds = [
  'html11-01', 'html12-01', 'html13-01', 'html13-02', 'html14-01',
  'html15-01', 'html15-02', 'html16-01', 'html17-01', 'html22-01',
  'html22-02', 'html23-01', 'html24-01'
];

test('配付原本12件は通過し、意図的に空欄のhtml12-01は文書構成不足として案内する', () => {
  for (const id of fixtureIds) {
    const file = path.join(repo, 'html/templates/v3', id, '2026-10-local-1.html');
    const result = diagnostics.check(fs.readFileSync(file, 'utf8'));
    if (id === 'html12-01') {
      assert.deepEqual(result.errors.map(error => error.code).sort(), ['html-required-body', 'html-required-html']);
      assert.equal(result.valid, false);
    } else {
      assert.equal(result.valid, true, `${id}: ${JSON.stringify(result.errors)}`);
      assert.deepEqual(result.errors, []);
    }
  }
});

test('コメント・raw text・引用符内のタグ風文字列・SVGをHTML要素として誤検出しない', () => {
  const source = `<!doctype html>
<html><head>
  <title>文字列の例: &lt;body&gt;</title>
  <style>
    /* <body><fake> */
    .sample[data-value=">"] { content: "<body>; >"; }
  </style>
</head><body>
  <!-- <body><div> -->
  <div title="> <body>" data-note='<fake>'>1 < 2 <p>本文</p></div>
  <textarea><body><div></textarea>
  <template><p>template text: &lt;body&gt;</p></template>
  <svg viewBox="0 0 10 10"><title>SVG text &lt;body&gt;</title><text>&lt;body&gt;</text>
    <foreignObject><p>HTML in SVG</p></foreignObject>
  </svg>
</body></html>`;
  assert.deepEqual(diagnostics.check(source).errors, []);
});

test('void要素と明示終了タグの授業ルールを区別する', () => {
  const voids = '<!doctype html><html><head><meta charset="utf-8"></head><body><img src="x"><br><hr><input><source><wbr></body></html>';
  assert.deepEqual(diagnostics.check(voids).errors, []);
  assert.deepEqual(diagnostics.check('<!doctype html><html><body><img></img></body></html>').errors.map(error => error.code), ['html-void-end']);

  const omitted = diagnostics.check('<!doctype html><html><body><p>one<p>two</body></html>');
  const explicitEnd = omitted.errors.find(error => error.code === 'html-explicit-end');
  assert.ok(explicitEnd);
  assert.match(explicitEnd.message, /HTML規格では省略できる場合もあります/);
  assert.equal(omitted.errors.some(error => error.code === 'html-nesting'), false,
    'ブラウザが暗黙に閉じるpの省略を、入れ子違反と重ねて説明しない');
});

test('HTMLの不正な入れ子・つづり違いを発生行に記録する', () => {
  const source = '<!doctype html>\n<html>\n<body>\n<div>\n<span>x</div>\n<dvi>y</dvi>\n</body>\n</html>';
  const result = diagnostics.check(source);
  const unclosed = result.errors.find(error => error.code === 'html-unclosed-tag');
  const unknown = result.errors.find(error => error.code === 'html-tag-name');
  assert.ok(unclosed);
  assert.equal(unclosed.line, 5);
  assert.ok(unknown);
  assert.equal(unknown.line, 6);
  assert.ok(result.errors.every(error => Number.isInteger(error.line) && error.line > 0));
});

test('CSS文字列・コメント・入れ子at-rule・ブロック形式custom propertyを受け入れる', () => {
  const source = `<!doctype html><html><head><style>
/* }; color: broken; */
.sample {
  content: "}; : ; url( <fake>";
  --tokens: { color: red; nested: { value: "a;b"; }; };
  color: red;
}
@media screen and (min-width: 1px) {
  @supports (display: grid) { .sample { --space: { small: 1px; }; gap: var(--gap, "a;b"); } }
}
</style></head><body><div style="content: 'a; b'; color: red;"></div></body></html>`;
  assert.deepEqual(diagnostics.check(source).errors, []);
});

test('CSSの明確なプロパティ名誤りを該当行に記録する', () => {
  const source = '<!doctype html>\n<html><head><style>\n.card {\n  color: red;\n  widt: 10px;\n}\n</style></head><body></body></html>';
  const error = diagnostics.check(source).errors.find(item => item.code === 'css-property');
  assert.ok(error);
  assert.equal(error.line, 5);
});

test('keyframesの百分率を要素セレクタとして誤検出しない', () => {
  const source = '@keyframes fade { 0%, 25% { opacity: 0; } 100% { opacity: 1; } }';
  const called = [];
  const result = diagnostics.check(source, {mode:'css', selector:value => { called.push(value); return !value.includes('%'); }});
  assert.equal(result.valid, true);
  assert.deepEqual(called, []);
});

test('上限超過と極端に深いCSS入れ子を安全に処理する', () => {
  const large = diagnostics.check('x\n'.repeat(1024 * 1024 + 1));
  assert.deepEqual(large.errors.map(error => error.code), ['source-limit']);
  assert.equal(large.limited, true);

  const depth = 6000;
  const nested = '<html><head><style>' + '@media all {'.repeat(depth) + '.x{color:red}' + '}'.repeat(depth) + '</style></head><body></body></html>';
  assert.doesNotThrow(() => diagnostics.check(nested));
  assert.ok(diagnostics.check(nested).errors.some(error => error.code === 'source-depth'));
});
