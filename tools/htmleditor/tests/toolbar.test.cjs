const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const html = fs.readFileSync(require.resolve('../index.html'), 'utf8');

test('主操作はダウンロード→開く→提出のDOM順で、キーボード順も同じにする', () => {
  const positions = ['taskDownloadBtn','openFilesBtn','submitBtn'].map(id => html.indexOf('id="' + id + '"'));
  assert.ok(positions.every(position => position >= 0));
  assert.ok(positions[0] < positions[1] && positions[1] < positions[2]);
});
test('手順と表示を、主操作の後ろの独立した操作グループへまとめる', () => {
  const group = html.match(/<div class="practice-support-actions" role="group" aria-label="手順と表示">([\s\S]*?)<\/details>\s*<\/div>/);
  assert.ok(group);
  assert.match(group[1], /id="practiceStepsBtn"/); assert.match(group[1], /id="viewMenu"/);
  assert.doesNotMatch(group[1], /id="(?:taskDownloadBtn|openFilesBtn|submitBtn)"/);
});
test('編集は左端の見出しとし、プレビューと同じpane-title書式を使う', () => {
  assert.match(html, /class="pane-header-content">\s*<div class="pane-title" id="editorPaneTitle">編集<\/div>\s*<div class="breadcrumb">/);
  assert.match(html, /class="preview-heading"><div class="pane-title">プレビュー<\/div>/);
});
