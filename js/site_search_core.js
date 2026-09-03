(() => {
  'use strict';

  const COURSE_KEYS = new Set(['dr', 'html', 'il', 'ss', 'py']);

  function normalizeText(value) {
    return String(value ?? '')
      .normalize('NFKC')
      .toLocaleLowerCase('ja')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function tokenize(query) {
    return Array.from(new Set(normalizeText(query).split(' ').filter(Boolean)));
  }

  function countOccurrences(text, token) {
    if (!text || !token) return 0;

    let count = 0;
    let offset = 0;
    while ((offset = text.indexOf(token, offset)) !== -1) {
      count++;
      offset += Math.max(token.length, 1);
    }
    return count;
  }

  function addFieldScore(text, token, { exact = 0, contains = 0, repeat = 0 } = {}) {
    if (!text || !token) return 0;
    if (text === token) return exact || contains;
    if (!text.includes(token)) return 0;

    return contains + Math.min(countOccurrences(text, token), 5) * repeat;
  }

  function normalizeDocument(document) {
    const sections = Array.isArray(document.sections) && document.sections.length
      ? document.sections
      : [{ heading: '', anchor: '', text: '', code: '' }];

    const normalizedSections = sections.map(section => ({
      source: section,
      heading: normalizeText(section.heading),
      text: normalizeText(section.text),
      code: normalizeText(section.code)
    }));

    return {
      source: document,
      title: normalizeText(document.title),
      detail: normalizeText(document.detail),
      courseLabel: normalizeText(document.courseLabel),
      category: normalizeText(document.category),
      sections: normalizedSections,
      searchable: [
        normalizeText(document.title),
        normalizeText(document.detail),
        normalizeText(document.courseLabel),
        normalizeText(document.category),
        ...normalizedSections.flatMap(section => [section.heading, section.text, section.code])
      ].filter(Boolean).join(' ')
    };
  }

  function scoreSection(document, section, tokens, normalizedQuery) {
    let score = 0;

    for (const token of tokens) {
      score += addFieldScore(document.title, token, {
        exact: 180,
        contains: 90,
        repeat: 0
      });
      score += addFieldScore(section.heading, token, {
        exact: 120,
        contains: 60,
        repeat: 0
      });
      score += addFieldScore(document.detail, token, {
        exact: 55,
        contains: 34,
        repeat: 1
      });
      score += addFieldScore(document.courseLabel, token, {
        exact: 30,
        contains: 18,
        repeat: 0
      });
      score += addFieldScore(document.category, token, {
        exact: 34,
        contains: 20,
        repeat: 0
      });
      score += addFieldScore(section.text, token, {
        exact: 20,
        contains: 12,
        repeat: 4
      });
      score += addFieldScore(section.code, token, {
        exact: 8,
        contains: 3,
        repeat: 1
      });
    }

    if (normalizedQuery) {
      if (document.title === normalizedQuery) score += 240;
      else if (document.title.includes(normalizedQuery)) score += 100;

      if (section.heading === normalizedQuery) score += 150;
      else if (section.heading.includes(normalizedQuery)) score += 70;

      if (document.detail.includes(normalizedQuery)) score += 36;
      if (section.text.includes(normalizedQuery)) score += 18;
      if (section.code.includes(normalizedQuery)) score += 5;
    }

    return score;
  }

  function chooseSnippetSource(document, section, tokens) {
    const candidates = [
      section.source.text,
      section.source.code,
      document.source.detail,
      section.source.heading,
      document.source.title
    ].filter(Boolean);

    const withMatch = candidates.find(value => {
      const normalized = normalizeText(value);
      return tokens.some(token => normalized.includes(token));
    });

    return withMatch || candidates[0] || '';
  }

  function buildNormalizedMap(value) {
    const source = String(value ?? '');
    let normalized = '';
    const starts = [];
    const ends = [];

    let graphemes;
    if (typeof Intl === 'object' && typeof Intl.Segmenter === 'function') {
      graphemes = Array.from(
        new Intl.Segmenter('ja', { granularity: 'grapheme' }).segment(source),
        part => ({
          raw: part.segment,
          start: part.index,
          end: part.index + part.segment.length
        })
      );
    } else {
      graphemes = [];
      for (let offset = 0; offset < source.length;) {
        const raw = String.fromCodePoint(source.codePointAt(offset));
        graphemes.push({ raw, start: offset, end: offset + raw.length });
        offset += raw.length;
      }
    }

    for (const grapheme of graphemes) {
      const converted = grapheme.raw.normalize('NFKC').toLocaleLowerCase('ja');

      for (let i = 0; i < converted.length; i++) {
        normalized += converted[i];
        starts.push(grapheme.start);
        ends.push(grapheme.end);
      }
    }

    return { source, normalized, starts, ends };
  }

  function findMatchRanges(value, rawTokens, limit = 40) {
    const tokens = Array.isArray(rawTokens) ? rawTokens : tokenize(rawTokens);
    if (!tokens.length) return [];

    const mapped = buildNormalizedMap(value);
    const ranges = [];

    for (const token of tokens) {
      if (!token) continue;

      let offset = 0;
      while (ranges.length < limit) {
        const index = mapped.normalized.indexOf(token, offset);
        if (index === -1) break;

        const last = index + token.length - 1;
        ranges.push({
          start: mapped.starts[index] ?? 0,
          end: mapped.ends[last] ?? mapped.source.length
        });
        offset = index + Math.max(token.length, 1);
      }
    }

    ranges.sort((a, b) => a.start - b.start || a.end - b.end);

    const merged = [];
    for (const range of ranges) {
      const previous = merged[merged.length - 1];
      if (previous && range.start <= previous.end) {
        previous.end = Math.max(previous.end, range.end);
      } else {
        merged.push({ ...range });
      }
    }
    return merged;
  }

  function createSnippet(value, rawTokens, maxLength = 150) {
    const source = String(value ?? '').replace(/\s+/g, ' ').trim();
    if (!source || source.length <= maxLength) return source;

    const ranges = findMatchRanges(source, rawTokens, 1);
    const matchStart = ranges[0]?.start ?? 0;
    const before = Math.floor(maxLength * 0.34);
    let start = Math.max(0, matchStart - before);
    let end = Math.min(source.length, start + maxLength);

    if (end === source.length) start = Math.max(0, end - maxLength);

    return `${start > 0 ? '…' : ''}${source.slice(start, end).trim()}${end < source.length ? '…' : ''}`;
  }

  function searchDocuments(documents, query, { course = '' } = {}) {
    const tokens = tokenize(query);
    if (!tokens.length || !Array.isArray(documents)) return [];

    const normalizedQuery = normalizeText(query);
    const courseFilter = COURSE_KEYS.has(course) ? course : '';
    const results = [];

    for (const rawDocument of documents) {
      if (!rawDocument || typeof rawDocument !== 'object') continue;
      if (courseFilter && rawDocument.course !== courseFilter) continue;

      const document = normalizeDocument(rawDocument);
      if (!tokens.every(token => document.searchable.includes(token))) continue;

      let bestSection = document.sections[0];
      let bestScore = Number.NEGATIVE_INFINITY;

      for (const section of document.sections) {
        const score = scoreSection(document, section, tokens, normalizedQuery);
        if (score > bestScore) {
          bestScore = score;
          bestSection = section;
        }
      }

      const snippetSource = chooseSnippetSource(document, bestSection, tokens);
      results.push({
        document: rawDocument,
        section: bestSection.source,
        score: bestScore,
        snippet: createSnippet(snippetSource, tokens),
        tokens
      });
    }

    return results.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return String(a.document.title || '').localeCompare(String(b.document.title || ''), 'ja');
    });
  }

  function buildFaqUrl(baseUrl, query = '', course = '') {
    const url = new URL('./faq.html', baseUrl);
    const trimmedQuery = String(query ?? '').trim();

    if (trimmedQuery) url.searchParams.set('q', trimmedQuery);
    if (COURSE_KEYS.has(course)) url.searchParams.set('course', course);
    return url.href;
  }

  function validateIndex(index) {
    return Boolean(
      index &&
      index.schemaVersion === 1 &&
      typeof index.sourceHash === 'string' &&
      index.sourceHash.length > 0 &&
      Array.isArray(index.documents)
    );
  }

  const api = {
    normalizeText,
    tokenize,
    findMatchRanges,
    createSnippet,
    searchDocuments,
    buildFaqUrl,
    validateIndex
  };

  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else if (typeof globalThis === 'object') {
    globalThis.__siteSearchCore = api;
  }
})();
