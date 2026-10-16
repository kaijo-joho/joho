const test = require('node:test');
const assert = require('node:assert/strict');
const onboarding = require('../onboarding.js');

function assess(overrides = {}) {
  return onboarding.assess({
    doc:null, source:'', connected:true, directory:{}, directoryName:'HTML実習',
    files:['html11-01.html'], lessonId:'html11', ...overrides
  });
}

test('導入課題のファイル未選択時は現在の「開く」とファイル選択画面へ案内する', () => {
  const result = assess();
  assert.equal(result.active, true);
  assert.equal(result.ready, false);
  assert.deepEqual(result.steps.map(step => step.done), [true, false, false]);
  assert.equal(result.message, 'エディタ上部の「開く」でファイル選択画面を表示し、HTML実習フォルダ直下の html11-01.html を選んでください。');
  assert.doesNotMatch(result.message, /「ファイル」|読み込んだファイル一覧/);
});

test('フォルダ未接続時はファイル選択より接続の案内を優先する', () => {
  const result = assess({connected:false, directory:null});
  assert.equal(result.ready, false);
  assert.deepEqual(result.steps.map(step => step.done), [false, false, false]);
  assert.match(result.message, /フォルダを接続してください/);
});

test('同じ接続先から開いた後は保存を案内し、読戻し確認後にだけ提出準備完了とする', () => {
  const directory = {};
  const doc = {fileName:'html11-01.html', openedFrom:directory, binding:directory, savedContent:'saved'};
  const opened = assess({directory, doc, source:'saved'});
  assert.equal(opened.ready, false);
  assert.match(opened.message, /「保存」を押して/);
  const saved = assess({directory, source:'saved', doc:{...doc, verifiedSave:{directory, content:'saved'}}});
  assert.equal(saved.ready, true);
  assert.deepEqual(saved.steps.map(step => step.done), [true, true, true]);
  assert.match(saved.message, /「提出」/);
});
