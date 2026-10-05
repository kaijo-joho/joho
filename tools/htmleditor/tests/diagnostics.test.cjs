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

const page = body => '<!doctype html><html><head><title>検査</title></head><body>' + body + '</body></html>';
for (const [label, source] of [
  ['classの欠落', page('<p clas="sample">本文</p>')],
  ['classの余分な文字', page('<p classs="sample">本文</p>')],
  ['styleの入替', page('<p styel="color:red">本文</p>')],
  ['srcの入替', page('<img scr="image.png" alt="画像">')],
  ['srcの置換', page('<img scc="image.png" alt="画像">')],
  ['altの欠落', page('<img src="image.png" al="画像">')],
  ['hrefの余分な文字', page('<a hreff="next.html">リンク</a>')],
  ['charsetの欠落', '<html><head><meta charst="utf-8"></head><body></body></html>'],
  ['http-equivの欠落', '<html><head><meta http-equv="content-type" content="text/html"></head><body></body></html>'],
  ['colspanの欠落', page('<table><tr><td clspan="2">値</td></tr></table>')],
  ['rowspanの入替', page('<table><tr><td rowsapn="2">値</td></tr></table>')],
  ['値のない属性の欠落', page('<input disabld>')],
  ['raw text要素の属性', '<html><head><style typ="text/css">p { color:red; }</style></head><body></body></html>']
]) test('主要属性の誤記: ' + label, () => {
  assert.ok(diagnostics.check(source).errors.some(error => error.code === 'html-attribute-name'));
});

test('属性名の位置は値と区別し、未知の独自属性・標準/旧属性を一律に拒否しない', () => {
  const source = '<html><head><meta charset="utf-8"></head><body>\n<p id="sample"\n clas="sample">本文</p>\n</body></html>';
  const error = diagnostics.check(source).errors.find(item => item.code === 'html-attribute-name');
  assert.equal(error.line, 3);
  assert.equal(error.column, 2);
  const valid = page('<p CLASS="sample" title="clas=sample; <li>" data-clas="x" aria-label="例" xml:lang="ja" custom="x">本文</p>' +
    '<textarea cols="20" rows="5" readonly></textarea><input disabled autofocus>' +
    '<font face="sans-serif" color="red" size="3">旧指定</font><table cellpadding="2" cellspacing="1" bgcolor="white"><tr><td>値</td></tr></table>' +
    '<p style="color: red;">本文</p>');
  assert.deepEqual(diagnostics.check(valid).errors, []);
});

test('独自要素・svg/math開始タグの属性名は除外しても、style値の既存CSS検査を保つ', () => {
  for (const tag of ['x-card', 'svg', 'math']) {
    const errors = diagnostics.check(page('<' + tag + ' clas="custom" style="colr: red"></' + tag + '>')).errors;
    assert.ok(errors.some(error => error.code === 'css-property'), tag);
    assert.ok(!errors.some(error => error.code === 'html-attribute-name'), tag);
  }
});

for (const [label, source] of [
  ['head内の本文', '<html><head><div>本文</div></head><body></body></html>'],
  ['html直下の本文', '<html><head></head><div>本文</div><body></body></html>'],
  ['headの位置', page('<head><title>別題名</title></head>')],
  ['bodyの位置', '<html><head></head><div><body>本文</body></div></html>'],
  ['headとbodyの順序', '<html><body></body><head><title>検査</title></head></html>'],
  ['titleの位置', page('<title>検査</title>')],
  ['styleの位置', page('<style>p { color:red; }</style>')],
  ['metaの位置', page('<meta charset="utf-8">')],
  ['リスト外のli', page('<li>項目</li>')],
  ['ul直下のp', page('<ul><p>項目</p></ul>')],
  ['ul内の不要な囲み', page('<ul><div><li>項目</li></div></ul>')],
  ['dl外のdt', page('<dt>用語</dt>')],
  ['dl外のdd', page('<div><dd>説明</dd></div>')],
  ['dlのグループ内のp', page('<dl><div><p>説明</p></div></dl>')],
  ['表外のtr', page('<tr><td>値</td></tr>')],
  ['行外のtd', page('<td>値</td>')],
  ['行外のth', page('<th>見出し</th>')],
  ['table直下のtd', page('<table><td>値</td></table>')],
  ['thead直下のtd', page('<table><thead><td>値</td></thead></table>')],
  ['tr直下のdiv', page('<table><tr><div>値</div></tr></table>')],
  ['表外のcaption', page('<caption>表題</caption>')],
  ['表外のtbody', page('<tbody><tr><td>値</td></tr></tbody>')],
  ['colgroup外のcol', page('<table><col></table>')],
  ['見出し内のdiv', page('<h1><div>見出し</div></h1>')],
  ['span内のdiv', page('<span><div>本文</div></span>')],
  ['strong内のp', page('<strong><p>本文</p></strong>')],
  ['見出し内の透明要素', page('<h1><a href="next.html"><div>見出し</div></a></h1>')],
  ['formの二重囲み', page('<form><div><form></form></div></form>')]
]) test('基本配置: ' + label, () => {
  assert.ok(diagnostics.check(source).errors.some(error => error.code === 'html-placement'));
});

test('正しいリスト・説明リスト・表・透明要素・テンプレート・foreign内容を保持する', () => {
  const source = page(
    '<ul><li>項目<ul><li>下位</li></ul></li><template><li>追加</li></template><script>"<li>"</script></ul>' +
    '<ol><li>項目</li></ol><menu><li>項目</li></menu>' +
    '<dl><dt>用語</dt><dd><p>説明</p></dd></dl><dl><div><dt>用語</dt><dd>説明</dd></div></dl>' +
    '<table><caption>表題</caption><colgroup><col><template><col></template></colgroup>' +
    '<thead><tr><th scope="col">見出し</th></tr></thead><tbody><tr><td colspan="2">値</td></tr></tbody><tfoot><tr><td>計</td></tr></tfoot></table>' +
    '<table><tr><td>tbodyの開始を明示しなくてもよい表</td></tr></table>' +
    '<a href="next.html"><div><p>本文</p></div></a><h1><a href="next.html"><strong>見出し</strong></a></h1>' +
    '<p><span><em>本文</em></span></p><link rel="stylesheet" href="style.css"><span><meta itemprop="name" content="例"></span>' +
    '<template><tr><td>断片</td></tr><style>p { color:red; }</style></template>' +
    '<x-card clas="custom" styel="custom"><div>独自要素</div></x-card>' +
    '<svg viewBox="0 0 10 10" clas="foreign"><title>図</title><foreignObject><div>本文</div></foreignObject></svg>' +
    '<math><mi clas="foreign">x</mi></math>');
  assert.deepEqual(diagnostics.check(source).errors, []);
});

test('headの重複も構成タグの重複として扱い、課題完成条件は追加しない', () => {
  const duplicate = diagnostics.check('<html><head></head><head></head><body></body></html>');
  assert.ok(duplicate.errors.some(error => error.code === 'html-duplicate-structure'));
  assert.deepEqual(diagnostics.check('<html><body></body></html>').errors, []);
});
