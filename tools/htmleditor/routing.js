/* HTML教材とエディタの同一サイト内URLだけを扱う純粋なルーティング方針。 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    const Practice = require('./practice.js');
    const Lessons = require('./lessons.js');
    module.exports = factory(Practice, Lessons);
  } else {
    root.HtmlEditorRouting = factory(root.HtmlPracticeEditor, root.HtmlLessons);
  }
})(typeof globalThis === 'undefined' ? this : globalThis, function (Practice, HtmlLessons) {
  'use strict';

  if (!Practice || !HtmlLessons || typeof Practice.lessons !== 'function') {
    throw new Error('HTMLエディタの教材定義を読み込めません。');
  }

  const catalog = Object.freeze(Practice.lessons(HtmlLessons.LESSONS));
  const entryLessonIds = Object.freeze([...new Set(Practice.targets.map(id => id.slice(0, 6)))]);
  const ENTRY = new Set(entryLessonIds);
  const EDITOR_SUFFIX = '/tools/htmleditor/index.html';
  const EDITOR_DIRECTORY = '/tools/htmleditor/';
  const SAFE_HASH = /^#[A-Za-z0-9_-]{1,100}$/;

  function assertHttp(url) {
    if (!/^https?:$/.test(url.protocol) || url.username || url.password) {
      throw new Error('HTTP(S)の同一サイトURLだけを指定してください。');
    }
  }

  function parseHref(href) {
    if (typeof href !== 'string' || href === '') throw new Error('URLを指定してください。');
    let url;
    try { url = new URL(href); } catch { throw new Error('絶対URLを指定してください。'); }
    assertHttp(url);
    return url;
  }

  function row(lessonId) {
    return catalog.find(item => item.id === lessonId) || null;
  }

  function defaultTask(lessonId) {
    return row(lessonId)?.files?.[0]?.id || '';
  }

  function normalize(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error('教材選択を指定してください。');
    }
    const lessonId = value.lessonId === undefined ? 'html12' : value.lessonId;
    const taskId = value.taskId === undefined ? '' : value.taskId;
    const hash = value.hash === undefined ? '' : value.hash;
    if (typeof lessonId !== 'string' || !row(lessonId)) throw new Error('指定された教材を確認できません。');
    if (typeof taskId !== 'string' || taskId === '') {
      if (taskId !== '') throw new Error('課題を確認できません。');
    } else {
      const lesson = row(lessonId);
      if (!Practice.targets.includes(taskId) || !lesson.files.some(file => file.id === taskId)) {
        throw new Error('教材と課題の組み合わせを確認できません。');
      }
    }
    if (typeof hash !== 'string' || (hash !== '' && !SAFE_HASH.test(hash))) {
      throw new Error('アンカーを確認できません。');
    }
    return Object.freeze({ lessonId, taskId: taskId || defaultTask(lessonId), hash });
  }

  function assertOnly(url, allowed) {
    const keys = [...url.searchParams.keys()];
    if (keys.some(key => !allowed.includes(key)) || allowed.some(key => url.searchParams.getAll(key).length > 1)) {
      throw new Error('URLの指定を確認できません。');
    }
    for (const key of allowed) if (url.searchParams.has(key) && url.searchParams.get(key) === '') {
      throw new Error('空のURLパラメータは指定できません。');
    }
  }

  function parseSelection(url, allowed, lessonRequired = false) {
    assertOnly(url, allowed);
    const requestedLesson = url.searchParams.get('lesson');
    const taskId = url.searchParams.get('task');
    if (lessonRequired && requestedLesson === null) throw new Error('教材を指定してください。');
    if (url.hash && !SAFE_HASH.test(url.hash)) throw new Error('アンカーを確認できません。');
    const lessonId = requestedLesson === null && taskId !== null ? taskId.slice(0, 6) : requestedLesson;
    return normalize({
      lessonId: lessonId === null ? undefined : lessonId,
      taskId: taskId === null ? undefined : taskId,
      hash: url.hash
    });
  }

  function create(editorHref) {
    const editor = parseHref(editorHref);
    // GitHub PagesのディレクトリURLも同じ入口として扱い、履歴はindex.htmlへ揃える。
    if (editor.pathname.endsWith(EDITOR_DIRECTORY)) editor.pathname += 'index.html';
    if (!editor.pathname.endsWith(EDITOR_SUFFIX) || editor.pathname.includes('//')) {
      throw new Error('エディタURLの場所を確認できません。');
    }
    const rootPath = editor.pathname.slice(0, -EDITOR_SUFFIX.length) || '/';
    const rootUrl = new URL(editor.origin + (rootPath.endsWith('/') ? rootPath : rootPath + '/'));
    const editorPath = new URL('tools/htmleditor/index.html', rootUrl);

    function fromEditor(href) {
      const url = parseHref(href);
      if (url.pathname.endsWith(EDITOR_DIRECTORY)) url.pathname += 'index.html';
      if (url.origin !== editor.origin || url.pathname !== editorPath.pathname) {
        throw new Error('エディタURLの場所を確認できません。');
      }
      return parseSelection(url, ['lesson', 'task']);
    }

    function fromLesson(href, { entryOnly = false } = {}) {
      const url = parseHref(href);
      if (url.origin !== editor.origin) return null;
      const lesson = catalog.find(item => new URL(item.id + '.html', rootUrl).pathname === url.pathname);
      if (!lesson || (entryOnly && !ENTRY.has(lesson.id))) return null;
      assertOnly(url, ['view', 'task']);
      const view = url.searchParams.get('view') || '';
      if (view !== '' && view !== 'lesson') throw new Error('教材表示の種類を確認できません。');
      if (url.hash && !SAFE_HASH.test(url.hash)) throw new Error('アンカーを確認できません。');
      const selection = normalize({ lessonId: lesson.id, taskId: url.searchParams.get('task') || undefined, hash: url.hash });
      return { selection, view };
    }

    function editorUrl(selection) {
      const value = normalize(selection);
      const url = new URL(editorPath.href);
      url.searchParams.set('lesson', value.lessonId);
      if (value.taskId) url.searchParams.set('task', value.taskId);
      url.hash = value.hash;
      return url.href;
    }

    function lessonUrl(selection, { task = false } = {}) {
      const value = normalize(selection);
      const url = new URL(value.lessonId + '.html', rootUrl);
      url.searchParams.set('view', 'lesson');
      if (task && value.taskId) url.searchParams.set('task', value.taskId);
      url.hash = value.hash;
      return url.href;
    }

    // 作成時のURL自体も、エディタ入口として厳密に検証する。
    if (editor.search || editor.hash) fromEditor(editor.href);
    return Object.freeze({ rootUrl: rootUrl.href, normalize, fromEditor, fromLesson, editorUrl, lessonUrl });
  }

  return Object.freeze({ catalog, entryLessonIds, create });
});
