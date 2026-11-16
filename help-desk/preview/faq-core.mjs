const fail = message => { throw new Error(message); };
const normalize = value => String(value || '').normalize('NFKC').toLowerCase();

export function findFaqs(catalog, query = '', { course = '', page = '', unit = '', category = '' } = {}) {
  const terms = normalize(query).trim().split(/\s+/).filter(Boolean);
  const pageCourses = new Set(page ? catalog.entries.filter(entry => entry.display_pages.includes(page)).map(entry => entry.course) : []);
  const activeCourse = course || (pageCourses.size === 1 ? [...pageCourses][0] : '');
  return catalog.entries.filter(entry => (!activeCourse || entry.course === activeCourse) && (!unit || entry.unit === unit) && (!category || entry.category === category)
    && (!page || entry.display_pages.includes(page) || (entry.display_pages.length === 0 && (activeCourse ? entry.course === activeCourse : pageCourses.has(entry.course)))))
    .map(entry => {
      const title = normalize(entry.question);
      const keywords = normalize(entry.keywords.join(' '));
      const all = normalize([entry.question, entry.short_answer, entry.body_text, entry.course_label, entry.unit, entry.category, keywords].join('\n'));
      return { entry, match: terms.every(term => all.includes(term)), score: terms.reduce((score, term) => score + (title.includes(term) ? 5 : keywords.includes(term) ? 3 : 1), 0) };
    }).filter(item => item.match)
    .sort((a, b) => b.score - a.score || a.entry.priority - b.entry.priority || a.entry.sort_order - b.entry.sort_order || a.entry.id.localeCompare(b.entry.id))
    .map(item => item.entry);
}

export function makeFaqHandoff(catalog, id) {
  const payload = { kind: 'faq', faq_id: id, source_sha256: catalog.source_sha256 };
  validateFaqHandoff(catalog, payload);
  return payload;
}

export function validateFaqHandoff(catalog, payload) {
  const keys = ['kind', 'faq_id', 'source_sha256'];
  if (!payload || typeof payload !== 'object' || Array.isArray(payload) || Object.keys(payload).length !== keys.length
    || keys.some(key => !Object.hasOwn(payload, key)) || payload.kind !== 'faq') fail('FAQの引継ぎ項目が不正です。');
  if (payload.source_sha256 !== catalog.source_sha256) fail('FAQ資料の版が一致しません。');
  const entry = catalog.entries.find(entry => entry.id === payload.faq_id);
  if (!entry) fail('FAQが見つかりません。');
  return { entry, summary: [{ question: '表示したFAQ', answer: entry.question }, { question: '講座', answer: entry.course_label }] };
}

export function legacyLocation(catalog, href) {
  const url = new URL(href);
  const courses = new Set(catalog.entries.map(entry => entry.course));
  const course = courses.has(url.searchParams.get('course')) ? url.searchParams.get('course') : '';
  const rawPage = url.searchParams.get('page') || url.searchParams.get('pageKey') || '';
  const candidatePage = /^[A-Za-z0-9._-]{1,80}$/.test(rawPage) ? rawPage.replace(/\.html$/, '') : '';
  const knownPages = new Set(catalog.entries.flatMap(entry => entry.display_pages));
  const page = knownPages.has(candidatePage) ? candidatePage : '';
  let hash = '';
  try { hash = decodeURIComponent(url.hash.slice(1)); } catch { /* 不正なハッシュを使わない。 */ }
  const ids = [url.searchParams.get('faq'), hash, hash.startsWith('faq-') ? hash.slice(4) : ''];
  const id = ids.find(id => catalog.entries.some(entry => entry.id === id)) || null;
  return { course, page, id };
}
