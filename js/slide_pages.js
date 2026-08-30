(() => {
  'use strict';

  const loaderScript = document.currentScript;
  const dataScriptBaseUrl = new URL('./', loaderScript?.src || document.baseURI);
  const siteBaseUrl = new URL('../', dataScriptBaseUrl);
  const slideDataBaseUrl = new URL('data/slides/', siteBaseUrl);
  const sourcePattern = /^[A-Za-z0-9_-]+$/;
  const supportedLayouts = new Set(['sections', 'inline']);
  const slideDataPromises = new Map();
  let initializationPromise = null;

  function getPageId() {
    const fileName = location.pathname.split('/').pop() || 'index';
    return fileName.replace(/\.html?$/i, '') || 'index';
  }

  function getRenderTargets() {
    const targets = Array.from(document.querySelectorAll('[data-slide-content]'));
    const legacyTarget = document.getElementById('content');

    if (legacyTarget && !targets.includes(legacyTarget)) {
      targets.unshift(legacyTarget);
    }
    return targets;
  }

  function getSlideSource(target, fallbackSource) {
    return (target.dataset.slideSource || fallbackSource).trim();
  }

  function validateSlideSource(source) {
    if (!sourcePattern.test(source)) {
      throw new Error(`スライド原本ID「${source}」は使用できません。`);
    }
    return source;
  }

  function loadSlideData(source) {
    if (slideDataPromises.has(source)) return slideDataPromises.get(source);

    const dataUrl = new URL(`${source}.json`, slideDataBaseUrl).href;
    const promise = (async () => {
      let response;
      try {
        response = await fetch(dataUrl, {
          headers: { Accept: 'application/json' },
          credentials: 'same-origin'
        });
      } catch (error) {
        throw new Error(
          `スライドデータ「${source}」を取得できませんでした: ${String(error?.message || error)}`
        );
      }

      if (!response.ok) {
        throw new Error(
          `スライドデータ「${source}」が見つかりません（HTTP ${response.status}）。`
        );
      }

      let payload;
      try {
        payload = await response.json();
      } catch (error) {
        throw new Error(
          `スライドデータ「${source}」をJSONとして読み取れません: ${String(error?.message || error)}`
        );
      }

      if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
        throw new Error(`スライドデータ「${source}」の形式が不正です。`);
      }
      if (payload.schemaVersion !== 1) {
        throw new Error(`スライドデータ「${source}」のschemaVersionに対応していません。`);
      }
      if (payload.source !== source) {
        throw new Error(
          `スライドデータのsource「${String(payload.source || '')}」が要求元「${source}」と一致しません。`
        );
      }
      if (!Array.isArray(payload.slides)) {
        throw new Error(`スライドデータ「${source}」のslidesが配列ではありません。`);
      }

      return payload.slides.map(entry => ({ ...entry }));
    })();

    slideDataPromises.set(source, promise);
    return promise;
  }

  function validateSlideData(entries) {
    const errors = [];

    if (!Array.isArray(entries) || entries.length === 0) {
      return ['スライドデータが空です。'];
    }

    entries.forEach((entry, index) => {
      const label = `${index + 1}件目`;
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
        errors.push(`${label}がオブジェクトではありません。`);
        return;
      }

      if (Object.prototype.hasOwnProperty.call(entry, 'section')) {
        if (typeof entry.section !== 'string' || entry.section.trim() === '') {
          errors.push(`${label}のsectionが空です。`);
        }
        return;
      }

      if (Object.prototype.hasOwnProperty.call(entry, 'slideTitle')) {
        if (typeof entry.slideTitle !== 'string') {
          errors.push(`${label}のslideTitleが文字列ではありません。`);
        }
        return;
      }

      if (typeof entry.title !== 'string' || entry.title.trim() === '') {
        errors.push(`${label}のtitleが空です。`);
      }
      if (typeof entry.note !== 'string') {
        errors.push(`${label}のnoteが文字列ではありません。`);
      }
      if (
        Object.prototype.hasOwnProperty.call(entry, 'image') &&
        (typeof entry.image !== 'string' || entry.image.trim() === '')
      ) {
        errors.push(`${label}のimageが不正です。`);
      }
      if (
        Object.prototype.hasOwnProperty.call(entry, 'imageAlt') &&
        typeof entry.imageAlt !== 'string'
      ) {
        errors.push(`${label}のimageAltが文字列ではありません。`);
      }
    });

    return errors;
  }

  function selectEntriesForTarget(entries, target) {
    const sectionName = (target.dataset.slideSection || '').trim();
    if (!sectionName) return entries;

    const selected = [];
    let inRequestedSection = false;
    let found = false;

    entries.forEach(entry => {
      if (Object.prototype.hasOwnProperty.call(entry, 'section')) {
        inRequestedSection = entry.section.trim() === sectionName;
        if (inRequestedSection) found = true;
      }
      if (inRequestedSection) selected.push(entry);
    });

    if (!found) {
      throw new Error(`指定したセクション「${sectionName}」が見つかりません。`);
    }

    if (target.dataset.slideSectionHeading === 'false' && selected[0]?.section) {
      return selected.slice(1);
    }
    return selected;
  }

  function getLayout(target) {
    const explicitLayout = (target.dataset.slideLayout || '').trim();
    const layout = explicitLayout || (target.hasAttribute('data-slide-content') ? 'inline' : 'sections');

    if (!supportedLayouts.has(layout)) {
      throw new Error(`data-slide-layout="${layout}"は使用できません。`);
    }
    return layout;
  }

  function getSlideHeadingLevel(target) {
    const value = Number(target.dataset.slideHeadingLevel || 3);
    return Number.isInteger(value) && value >= 3 && value <= 6 ? value : 3;
  }

  function dispatchImageError(source, entry, imageUrl) {
    const detail = {
      source,
      renderedCount: 0,
      targetCount: getRenderTargets().length,
      errors: [`画像「${imageUrl}」を読み込めませんでした。`],
      slideTitle: entry.title || ''
    };
    console.error('[slide_pages]', detail.errors[0]);
    document.dispatchEvent(new CustomEvent('slides:error', { detail }));
  }

  function appendSlide(parent, entry, source, headingLevel, renderState) {
    const heading = document.createElement(`h${headingLevel}`);
    heading.textContent = entry.title;
    if (entry.slideObjectId) heading.dataset.slideObjectId = String(entry.slideObjectId);
    parent.appendChild(heading);

    const note = document.createElement('div');
    note.className = 'note';
    note.innerHTML = entry.note;
    parent.appendChild(note);

    if (!entry.image) return;

    const imageUrl = new URL(entry.image, siteBaseUrl).href;
    const image = document.createElement('img');
    image.src = imageUrl;
    image.alt = (entry.imageAlt || entry.title).trim();
    image.className = 'slide_img screen_shot';
    image.style.maxWidth = '90%';
    image.decoding = 'async';
    image.loading = renderState.imageCount === 0 ? 'eager' : 'lazy';
    image.addEventListener(
      'error',
      () => dispatchImageError(source, entry, imageUrl),
      { once: true }
    );
    renderState.imageCount++;

    const link = document.createElement('a');
    link.href = imageUrl;
    link.setAttribute('data-lightbox', 'abc');
    link.className = 'expand-img';
    link.appendChild(image);

    const centered = document.createElement('div');
    centered.className = 'center';
    centered.appendChild(link);

    if (entry.showInDetails) {
      const details = document.createElement('details');
      const summary = document.createElement('summary');
      summary.textContent = '画像を表示';
      details.append(summary, centered);
      parent.appendChild(details);
    } else {
      parent.appendChild(centered);
    }
  }

  function renderAsSections(entries, target, source, renderState) {
    const container = document.createElement('div');
    container.className = 'slides-container slides-container--sections';
    let currentArticle = null;

    entries.forEach(entry => {
      if (entry.slideTitle) return;

      if (entry.section) {
        const section = document.createElement('section');
        currentArticle = document.createElement('article');
        const heading = document.createElement('h2');
        heading.textContent = entry.section;
        renderState.headlineCount++;
        heading.id = `headline_${renderState.headlineCount}`;
        currentArticle.appendChild(heading);
        section.appendChild(currentArticle);
        container.appendChild(section);
        return;
      }

      if (!currentArticle) {
        const section = document.createElement('section');
        currentArticle = document.createElement('article');
        section.appendChild(currentArticle);
        container.appendChild(section);
      }

      appendSlide(currentArticle, entry, source, 3, renderState);
    });

    target.replaceChildren(container);
  }

  function renderInline(entries, target, source, renderState) {
    const container = document.createElement('div');
    container.className = 'slides-container slides-container--inline';
    const headingLevel = getSlideHeadingLevel(target);

    entries.forEach(entry => {
      if (entry.section || entry.slideTitle) return;
      appendSlide(container, entry, source, headingLevel, renderState);
    });

    target.replaceChildren(container);
  }

  function renderTarget(entries, target, source, renderState) {
    const selectedEntries = selectEntriesForTarget(entries, target);
    const layout = getLayout(target);

    if (layout === 'inline') renderInline(selectedEntries, target, source, renderState);
    else renderAsSections(selectedEntries, target, source, renderState);

    target.dataset.slidesState = 'ready';
    target.dataset.slideSource = source;
    target.removeAttribute('aria-busy');
  }

  function showTargetError(target, message) {
    const error = document.createElement('p');
    error.className = 'slide-content-error';
    error.setAttribute('role', 'alert');
    error.textContent = message;
    target.replaceChildren(error);
    target.dataset.slidesState = 'error';
    target.removeAttribute('aria-busy');
  }

  function dispatchReady(detail) {
    document.documentElement.dataset.slidesState = detail.errors.length ? 'error' : 'ready';
    document.dispatchEvent(new CustomEvent('slides:ready', { detail }));
    if (detail.errors.length) {
      document.dispatchEvent(new CustomEvent('slides:error', { detail }));
    }
  }

  async function initializeSlidePages() {
    if (initializationPromise) return initializationPromise;

    initializationPromise = (async () => {
      const targets = getRenderTargets();
      if (targets.length === 0) return;

      targets.forEach(target => target.setAttribute('aria-busy', 'true'));
      const errors = new Set();
      const fallbackSource = getPageId();
      const targetSources = new Map();
      let renderedCount = 0;

      targets.forEach(target => {
        try {
          const source = validateSlideSource(getSlideSource(target, fallbackSource));
          targetSources.set(target, source);
        } catch (error) {
          const message = String(error?.message || error);
          errors.add(message);
          showTargetError(target, message);
        }
      });

      const sources = Array.from(new Set(targetSources.values()));
      const sourceResults = new Map(
        await Promise.all(sources.map(async source => {
          try {
            const entries = await loadSlideData(source);
            const dataErrors = validateSlideData(entries);
            if (dataErrors.length) {
              throw new Error(`スライドデータ「${source}」: ${dataErrors.join(' ')}`);
            }
            return [source, { entries, error: null }];
          } catch (error) {
            return [source, { entries: null, error }];
          }
        }))
      );

      const renderState = { imageCount: 0, headlineCount: 0 };
      targetSources.forEach((source, target) => {
        const result = sourceResults.get(source);
        if (!result || result.error) {
          const message = String(result?.error?.message || result?.error || '不明な読込エラー');
          errors.add(message);
          showTargetError(target, message);
          return;
        }

        try {
          renderTarget(result.entries, target, source, renderState);
          renderedCount++;
        } catch (error) {
          const message = String(error?.message || error);
          errors.add(message);
          showTargetError(target, message);
        }
      });

      const errorList = Array.from(errors);
      dispatchReady({
        source: sources.length === 1 ? sources[0] : '',
        sources,
        renderedCount,
        targetCount: targets.length,
        errors: errorList
      });
    })();

    return initializationPromise;
  }

  window.initSlidePages = initializeSlidePages;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeSlidePages, { once: true });
  } else {
    initializeSlidePages();
  }
})();
