// ./js/lesson-slide-deck.js
(() => {
  'use strict';

  const PAGE_SELECTOR = '[data-lesson-slide-deck]';
  const SLIDE_SELECTOR = '[data-lesson-slide]';
  const VIEW_GROUP_SELECTOR = '[data-lesson-view-group]';
  const VIEW_BUTTON_SELECTOR = '[data-lesson-view]';
  const VIEW_PANEL_SELECTOR = '[data-lesson-view-panel]';
  const SUPPLEMENT_DIALOG_SELECTOR = '[data-lesson-supplement-dialog]';
  const SUPPLEMENT_OPEN_SELECTOR = '[data-lesson-supplement-open]';
  const OVERLAY_OPEN_EVENT = 'joho:overlay-open';
  const CONTENT_RESIZE_EVENT = 'joho:lesson-content-resize';
  const INTERACTIVE_SELECTOR = [
    'a',
    'button',
    'input',
    'select',
    'textarea',
    'summary',
    'dialog',
    '[contenteditable="true"]',
    '[role="button"]',
    '[role="slider"]',
    '[role="tab"]',
    '[data-lesson-slide-navigation-lock]'
  ].join(',');

  let deckSequence = 0;
  let viewGroupSequence = 0;

  function createElement(tagName, className = '', text = '') {
    const node = document.createElement(tagName);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  }

  function decodedHashId(hash = location.hash) {
    if (!hash || hash === '#') return '';
    try {
      return decodeURIComponent(hash.slice(1));
    } catch {
      return hash.slice(1);
    }
  }

  function titleForSlide(slide, index) {
    const explicit = slide.dataset.lessonSlideTitle?.trim();
    if (explicit) return explicit;
    const heading = slide.querySelector('h1, h2, h3');
    return heading?.textContent?.trim() || `スライド ${index + 1}`;
  }

  function isKeyboardNavigationTarget(target) {
    return target instanceof Element && Boolean(target.closest(INTERACTIVE_SELECTOR));
  }

  function currentPageId() {
    const name = location.pathname.split('/').pop() || 'index';
    return name.replace(/\.html?$/i, '') || 'index';
  }

  function nextLesson(page) {
    const unavailable = { url: '', label: '次の教材へ' };
    const explicitUrl = page.dataset.lessonSlideNextUrl?.trim();
    if (explicitUrl) {
      if (!window.isPageLinkReleased?.(explicitUrl)) return unavailable;
      return {
        url: explicitUrl,
        label: page.dataset.lessonSlideNextLabel?.trim() || '次の教材へ'
      };
    }

    const metadata = window.pages?.[page.dataset.lessonPageId?.trim() || currentPageId()];
    if (metadata && Object.prototype.hasOwnProperty.call(metadata, 'next')) {
      const candidates = Array.isArray(metadata.next) ? metadata.next : [];
      const next = candidates.find(item =>
        typeof item?.url === 'string' && item.url.trim() && window.isPageLinkReleased?.(item)
      );
      return next ? {
        url: next.url.trim(),
        label: String(next.text || next.title || '次の教材へ').trim()
      } : unavailable;
    }

    const generatedLink = Array.from(document.querySelectorAll('#next_page a[href]'))
      .find(link => window.isPageLinkReleased?.(link.href));
    return generatedLink
      ? { url: generatedLink.href, label: generatedLink.textContent?.trim() || '次の教材へ' }
      : unavailable;
  }

  class LessonViewGroup {
    constructor(group) {
      if (!(group instanceof HTMLElement)) throw new TypeError('表示切替グループが必要です。');
      if (group.__lessonViewGroup) return group.__lessonViewGroup;

      this.group = group;
      this.id = group.id || `lesson-view-group-${++viewGroupSequence}`;
      this.group.id = this.id;
      this.buttons = Array.from(group.querySelectorAll(VIEW_BUTTON_SELECTOR));
      this.panels = Array.from(group.querySelectorAll(VIEW_PANEL_SELECTOR));
      this.values = this.buttons.map(button => button.dataset.lessonView?.trim()).filter(Boolean);
      if (!this.buttons.length || !this.panels.length || !this.values.length) {
        throw new Error('表示切替にはボタンとパネルが必要です。');
      }

      this.prepare();
      this.bind();
      const hashValue = this.valueContainingHash(location.hash);
      const initial = hashValue || group.dataset.lessonDefaultView?.trim() || this.values[0];
      this.activate(initial, { focus: false, updateHash: false });
      group.__lessonViewGroup = this;
    }

    panelFor(value) {
      return this.panels.find(panel => panel.dataset.lessonViewPanel === value) || null;
    }

    prepare() {
      this.buttons.forEach((button, index) => {
        const value = button.dataset.lessonView?.trim();
        const panel = this.panelFor(value);
        if (!panel) return;
        if (!button.id) button.id = `${this.id}-tab-${index + 1}`;
        if (!panel.id) panel.id = `${this.id}-panel-${index + 1}`;
        button.type = 'button';
        button.setAttribute('role', 'tab');
        button.setAttribute('aria-controls', panel.id);
        panel.setAttribute('role', 'tabpanel');
        panel.setAttribute('aria-labelledby', button.id);
      });
    }

    bind() {
      this.buttons.forEach((button, index) => {
        button.addEventListener('click', () => {
          this.activate(button.dataset.lessonView, { focus: false, updateHash: true });
        });
        button.addEventListener('keydown', event => {
          if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
          event.preventDefault();
          let nextIndex = index;
          if (event.key === 'ArrowLeft') nextIndex = (index - 1 + this.buttons.length) % this.buttons.length;
          if (event.key === 'ArrowRight') nextIndex = (index + 1) % this.buttons.length;
          if (event.key === 'Home') nextIndex = 0;
          if (event.key === 'End') nextIndex = this.buttons.length - 1;
          const next = this.buttons[nextIndex];
          this.activate(next.dataset.lessonView, { focus: true, updateHash: true });
        });
      });
    }

    valueContainingHash(hash) {
      const id = decodedHashId(hash);
      if (!id) return '';
      const target = document.getElementById(id);
      const panel = target?.closest(VIEW_PANEL_SELECTOR);
      return panel && this.group.contains(panel) ? panel.dataset.lessonViewPanel || '' : '';
    }

    activateForHash(hash) {
      const value = this.valueContainingHash(hash);
      if (!value) return false;
      this.activate(value, { focus: false, updateHash: false });
      return true;
    }

    activate(value, options = {}) {
      const nextValue = this.values.includes(value) ? value : this.values[0];
      const { focus = false, updateHash = false } = options;
      this.buttons.forEach(button => {
        const active = button.dataset.lessonView === nextValue;
        button.setAttribute('aria-selected', String(active));
        button.tabIndex = active ? 0 : -1;
        button.classList.toggle('is-current', active);
        if (active && focus) button.focus({ preventScroll: true });
      });
      this.panels.forEach(panel => {
        const active = panel.dataset.lessonViewPanel === nextValue;
        panel.hidden = !active;
        panel.classList.toggle('is-current', active);
      });
      this.group.dataset.lessonCurrentView = nextValue;

      const panel = this.panelFor(nextValue);
      if (updateHash && panel) {
        const targetId = panel.id || panel.querySelector('[id]')?.id;
        if (targetId) {
          const url = new URL(location.href);
          url.hash = targetId;
          history.replaceState(history.state, '', url);
        }
      }

      document.dispatchEvent(new CustomEvent('joho:lesson-view-change', {
        detail: { group: this.group, value: nextValue, panel }
      }));
      document.dispatchEvent(new CustomEvent(CONTENT_RESIZE_EVENT));
    }
  }

  class LessonSlideDeck {
    constructor(page) {
      if (!(page instanceof HTMLElement)) throw new TypeError('スライドページが必要です。');
      if (page.__lessonSlideDeck) return page.__lessonSlideDeck;

      this.page = page;
      this.slides = Array.from(page.querySelectorAll(SLIDE_SELECTOR));
      if (this.slides.length < 2) throw new Error('スライドは2枚以上必要です。');

      this.cover = page.querySelector('#page_header');
      if (this.cover?.querySelector('h1')) {
        this.cover.dataset.lessonSlide = '';
        this.cover.dataset.lessonSlideTitle = 'タイトル';
        this.cover.classList.add('lesson-slide--cover');
        this.slides.unshift(this.cover);
      } else {
        this.cover = null;
      }
      this.firstSlideNumber = this.cover ? 0 : 1;
      this.lastSlideNumber = this.slides.length - 1 + this.firstSlideNumber;

      this.id = `lesson-slide-deck-${++deckSequence}`;
      this.currentIndex = 0;
      this.titles = this.slides.map(titleForSlide);
      this.nextLesson = nextLesson(page);
      this.resizeFrame = 0;
      this.resizeObserver = null;
      this.contentObserver = null;
      this.preserveSelectFocus = false;

      this.build();
      this.bind();
      this.page.__lessonSlideDeck = this;
      this.page.classList.add('lesson-slide-ready');
      this.initializeFullscreen();

      const requestedIndex = this.indexFromHash(location.hash);
      const defaultIndex = this.indexFromDefaultSlide();
      this.show(requestedIndex >= 0 ? requestedIndex : defaultIndex, { updateHash: false });
      this.scheduleMeasure();
    }

    slidePosition(index) {
      return `${index + this.firstSlideNumber} / ${this.lastSlideNumber}`;
    }

    build() {
      this.deck = createElement('div', 'lesson-slide-deck');
      this.deck.id = this.id;
      this.deck.setAttribute('role', 'region');
      this.deck.setAttribute('aria-roledescription', 'スライド教材');
      this.deck.setAttribute('aria-label', document.querySelector('#title')?.textContent?.trim() || '座学教材');

      this.viewport = createElement('div', 'lesson-slide-deck__viewport');
      this.viewport.id = `${this.id}-viewport`;
      this.viewport.setAttribute('aria-live', 'off');
      const firstSlide = this.slides[0];
      firstSlide.before(this.deck);

      this.slides.forEach((slide, index) => {
        const heading = slide.querySelector('h1, h2, h3');
        if (!slide.id) slide.id = `${this.id}-slide-${index + this.firstSlideNumber}`;
        slide.classList.add('lesson-slide');
        slide.dataset.lessonSlideIndex = String(index);
        slide.setAttribute('role', 'group');
        slide.setAttribute('aria-roledescription', 'スライド');
        slide.setAttribute('aria-label', `${this.slidePosition(index)}：${this.titles[index]}`);
        slide.hidden = true;
        if (heading && !heading.hasAttribute('tabindex')) heading.tabIndex = -1;
        this.viewport.appendChild(slide);
      });

      if (this.cover) {
        const start = createElement('button', 'lesson-slide-deck__button lesson-slide-cover__start', '学習を始める →');
        start.type = 'button';
        start.addEventListener('click', () => this.show(1, { focusHeading: true }));
        this.cover.querySelector('article').appendChild(start);
      }

      this.navigation = createElement('nav', 'lesson-slide-deck__navigation');
      this.navigation.setAttribute('aria-label', 'スライド間の移動');
      this.previousButton = this.makeNavigationButton('previous', '←', '前のスライド');
      this.nextButton = this.makeNavigationButton('next', '→', '次のスライド');

      this.chooser = createElement('div', 'lesson-slide-deck__chooser');
      this.slideChoices = createElement('div', 'lesson-slide-deck__choices');
      this.slideChoices.hidden = true;
      this.choiceButtons = this.slides.map((slide, index) => {
        const button = createElement('button', 'lesson-slide-deck__choice');
        button.type = 'button';
        button.setAttribute('aria-label', `${this.slidePosition(index)}：${this.titles[index]}`);
        button.setAttribute('aria-controls', this.viewport.id);
        button.title = `${index + this.firstSlideNumber}：${this.titles[index]}`;
        button.append(
          createElement('span', 'lesson-slide-deck__choice-number', String(index + this.firstSlideNumber)),
          createElement('span', 'lesson-slide-deck__choice-title', this.titles[index])
        );
        this.slideChoices.appendChild(button);
        return button;
      });

      // 非表示の計測用コピーで、選択中のボタンやフォーカスを動かさず全文の幅を測る。
      this.choiceMeasurements = this.slideChoices.cloneNode(true);
      this.choiceMeasurements.classList.add('lesson-slide-deck__choices--measure');
      this.choiceMeasurements.hidden = false;
      this.choiceMeasurements.inert = true;
      this.choiceMeasurements.setAttribute('aria-hidden', 'true');

      this.slideSelect = createElement('select', 'lesson-slide-deck__select');
      this.slideSelect.setAttribute('aria-label', 'スライドを選択');
      this.slideSelect.setAttribute('aria-controls', this.viewport.id);
      this.slides.forEach((slide, index) => {
        const option = createElement('option', '', `${this.slidePosition(index)}　${this.titles[index]}`);
        option.value = String(index);
        this.slideSelect.appendChild(option);
      });

      this.status = createElement('output', 'lesson-slide-deck__status');
      this.status.setAttribute('aria-live', 'polite');
      this.status.setAttribute('aria-atomic', 'true');
      this.chooser.append(this.slideChoices, this.slideSelect, this.choiceMeasurements);
      this.navigation.append(this.previousButton, this.chooser, this.nextButton, this.status);
      this.deck.appendChild(this.viewport);

      // ページ紹介の表示・非表示で移動バーの位置が変わらないよう、本文の外へ置く。
      this.siteHeader = document.getElementById('site-header');
      this.siteFooter = document.getElementById('site-footer');
      if (this.siteHeader) this.siteHeader.after(this.navigation);
      else this.deck.before(this.navigation);
    }

    makeNavigationButton(direction, symbol, label) {
      const button = createElement('button', `lesson-slide-deck__button lesson-slide-deck__button--${direction}`);
      const symbolNode = createElement('span', 'lesson-slide-deck__button-symbol', symbol);
      const labelNode = createElement('span', 'lesson-slide-deck__button-label', label);
      symbolNode.setAttribute('aria-hidden', 'true');
      button.type = 'button';
      button.append(symbolNode, labelNode);
      return button;
    }

    initializeFullscreen() {
      const controls = this.siteHeader?.querySelector('.site-preference-controls');
      // 文書全体を対象にし、教材内の補足dialogと背景も維持する。
      const target = document.documentElement;
      const useStandard = typeof target.requestFullscreen === 'function' && document.fullscreenEnabled !== false;
      const request = useStandard ? target.requestFullscreen
        : document.webkitFullscreenEnabled !== false && target.webkitRequestFullscreen;
      const exit = useStandard ? document.exitFullscreen : document.webkitExitFullscreen;
      if (!controls || !window.siteHeaderMenus || typeof request !== 'function' || typeof exit !== 'function') return;

      const menu = createElement('div', 'site-header-menu');
      const button = createElement('button', 'site-header-button lesson-slide-deck__fullscreen');
      button.type = 'button';
      button.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path></path></svg>';
      const icon = button.querySelector('path');
      const panel = createElement('div', 'site-header-panel lesson-slide-deck__fullscreen-menu');
      panel.id = `${this.deck.id}-fullscreen-options`;
      panel.setAttribute('role', 'group');
      panel.setAttribute('aria-label', '全画面表示');
      const start = createElement('button', 'site-header-panel__action', 'スライドを全画面表示');
      start.type = 'button';
      panel.appendChild(start);
      menu.append(button, panel);
      const message = createElement('p', 'lesson-slide-deck__fullscreen-error');
      message.hidden = true;
      message.setAttribute('role', 'status');
      this.chooser.appendChild(message);
      controls.appendChild(menu);

      let active = false;
      let pending = false;
      window.siteHeaderMenus.bind({ root: menu, trigger: button, panel, enabled: () => !active && !pending });
      const updateButton = () => {
        const label = active ? '全画面表示を終了' : '全画面表示メニューを開く';
        button.setAttribute('aria-label', label);
        button.setAttribute('aria-pressed', String(active));
        button.setAttribute('aria-controls', active ? this.deck.id : panel.id);
        if (active) button.removeAttribute('aria-expanded');
        else button.setAttribute('aria-expanded', 'false');
        button.title = active ? `${label}（Esc）` : label;
        icon.setAttribute('d', active
          ? 'M3 8h5V3M21 8h-5V3M16 21v-5h5M8 21v-5H3'
          : 'M8 3H3v5M16 3h5v5M21 16v5h-5M3 16v5h5');
      };
      const finishRequest = () => {
        pending = false;
        button.removeAttribute('aria-disabled');
        start.removeAttribute('aria-disabled');
      };
      const closeOverlays = () => {
        document.dispatchEvent(new CustomEvent(OVERLAY_OPEN_EVENT, {
          detail: { source: 'lesson-slide-fullscreen' }
        }));
      };
      const sync = () => {
        const nextActive = (document.fullscreenElement || document.webkitFullscreenElement) === target;
        if (nextActive === active) return;
        active = nextActive;
        finishRequest();
        message.hidden = true;
        closeOverlays();
        document.body.classList.toggle('is-lesson-fullscreen', active);
        // 同じボタンを移動し、ヘッダーを隠した全画面内にも終了操作を残す。
        if (active) this.navigation.appendChild(button);
        else menu.insertBefore(button, panel);
        updateButton();
        button.focus({ preventScroll: true });
        this.preserveSelectFocus = false;
        this.scheduleMeasure();
      };
      const showError = () => {
        finishRequest();
        message.textContent = '全画面表示を切り替えられませんでした。もう一度お試しください。';
        message.hidden = false;
        button.focus({ preventScroll: true });
        this.scheduleMeasure();
      };

      const toggleFullscreen = async () => {
        if (pending) return;
        pending = true;
        button.setAttribute('aria-disabled', 'true');
        start.setAttribute('aria-disabled', 'true');
        message.hidden = true;
        closeOverlays();
        try {
          await (active ? exit.call(document) : request.call(target));
          sync();
        } catch {
          showError();
        } finally {
          finishRequest();
        }
      };
      start.addEventListener('click', toggleFullscreen);
      button.addEventListener('click', () => {
        // 通常時は共通メニューが開くだけ。全画面中は1クリックで終了する。
        if (active) toggleFullscreen();
      });
      document.addEventListener('fullscreenchange', sync);
      document.addEventListener('webkitfullscreenchange', sync);
      target.addEventListener('fullscreenerror', showError);
      target.addEventListener('webkitfullscreenerror', showError);
      updateButton();
    }

    bind() {
      this.choiceButtons.forEach((button, index) => {
        button.addEventListener('click', () => this.show(index, { focusHeading: true }));
      });
      this.slideSelect.addEventListener('change', () => {
        // ネイティブselectの連続選択を妨げないよう、フォーカスは移さない。
        this.preserveSelectFocus = true;
        this.show(Number(this.slideSelect.value));
      });
      this.slideSelect.addEventListener('blur', () => {
        this.preserveSelectFocus = false;
        this.scheduleMeasure();
      });
      const openSlideSelect = () => {
        document.dispatchEvent(new CustomEvent(OVERLAY_OPEN_EVENT, {
          detail: { source: 'lesson-slide-select' }
        }));
      };
      this.slideSelect.addEventListener('pointerdown', openSlideSelect);
      this.slideSelect.addEventListener('keydown', event => {
        if (['Enter', ' ', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) openSlideSelect();
      });
      this.previousButton.addEventListener('click', () => {
        if (this.currentIndex > 0) this.show(this.currentIndex - 1, { focusHeading: true });
      });
      this.nextButton.addEventListener('click', () => {
        if (this.currentIndex < this.slides.length - 1) {
          this.show(this.currentIndex + 1, { focusHeading: true });
          return;
        }
        if (this.nextLesson.url) location.assign(this.nextLesson.url);
      });

      document.addEventListener('keydown', event => {
        if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
        if (document.querySelector('dialog[open]')) return;
        if (isKeyboardNavigationTarget(event.target)) return;
        if (event.key === 'ArrowRight' || event.key === 'PageDown') {
          if (this.currentIndex >= this.slides.length - 1 && !this.nextLesson.url) return;
          event.preventDefault();
          this.nextButton.click();
        }
        if (event.key === 'ArrowLeft' || event.key === 'PageUp') {
          if (this.currentIndex === 0) return;
          event.preventDefault();
          this.previousButton.click();
        }
      });

      window.addEventListener('hashchange', () => {
        initializeViewGroups(this.page).forEach(group => group.activateForHash(location.hash));
        const index = this.indexFromHash(location.hash);
        if (index >= 0 && index !== this.currentIndex) this.show(index, { updateHash: false });
      });
      const resizeNavigation = () => {
        this.preserveSelectFocus = false;
        this.scheduleMeasure();
      };
      window.addEventListener('resize', resizeNavigation, { passive: true });
      document.addEventListener('joho:text-size-change', resizeNavigation);
      document.addEventListener(CONTENT_RESIZE_EVENT, () => this.scheduleMeasure());
      document.fonts?.ready.then(() => this.scheduleMeasure());

      if (typeof ResizeObserver === 'function') {
        this.resizeObserver = new ResizeObserver(() => this.scheduleMeasure());
        [this.siteHeader, this.siteFooter, document.getElementById('page_header'), this.navigation, this.chooser, this.deck]
          .filter(Boolean)
          .forEach(node => this.resizeObserver.observe(node));
      }
      if (typeof MutationObserver === 'function') {
        this.contentObserver = new MutationObserver(() => this.scheduleMeasure());
        this.contentObserver.observe(this.viewport, { childList: true, characterData: true, subtree: true });
      }
    }

    indexFromHash(hash) {
      const id = decodedHashId(hash);
      return this.indexContainingId(id);
    }

    indexFromDefaultSlide() {
      const id = this.page.dataset.lessonDefaultSlide?.trim() || '';
      const index = this.indexContainingId(id);
      return index >= 0 ? index : 0;
    }

    indexContainingId(id) {
      if (!id) return -1;
      return this.slides.findIndex(slide =>
        slide.id === id || Array.from(slide.querySelectorAll('[id]')).some(node => node.id === id)
      );
    }

    updateHash(slide) {
      const heading = slide.querySelector('h1[id], h2[id], h3[id], [id]');
      const id = heading?.id || slide.id;
      if (!id || location.hash === `#${id}`) return;
      const url = new URL(location.href);
      url.hash = id;
      history.replaceState(history.state, '', url);
    }

    show(index, options = {}) {
      const nextIndex = Math.max(0, Math.min(this.slides.length - 1, Number(index) || 0));
      const { focusHeading = false, updateHash = true } = options;
      this.currentIndex = nextIndex;
      this.page.classList.toggle('lesson-slide-page--intro', nextIndex === 0);
      this.page.classList.toggle('lesson-slide-page--content', nextIndex > 0);

      this.slides.forEach((slide, slideIndex) => {
        const active = slideIndex === nextIndex;
        slide.hidden = !active;
        slide.setAttribute('aria-hidden', String(!active));
        slide.classList.toggle('is-current', active);
        if (active) slide.scrollTop = 0;
      });
      this.slideSelect.value = String(nextIndex);
      this.choiceButtons.forEach((button, index) => {
        if (index === nextIndex) button.setAttribute('aria-current', 'step');
        else button.removeAttribute('aria-current');
      });
      this.status.value = `スライド ${this.slidePosition(nextIndex)}：${this.titles[nextIndex]}`;
      this.previousButton.disabled = nextIndex === 0;

      const last = nextIndex === this.slides.length - 1;
      const nextLabel = this.nextButton.querySelector('.lesson-slide-deck__button-label');
      if (last) {
        nextLabel.textContent = this.nextLesson.url ? '次の教材' : '完了';
        this.nextButton.disabled = !this.nextLesson.url;
        this.nextButton.classList.toggle('is-page-link', Boolean(this.nextLesson.url));
        this.nextButton.setAttribute('aria-label', this.nextLesson.url
          ? `${this.nextLesson.label}：次のページへ進む`
          : 'この教材は完了です');
      } else {
        nextLabel.textContent = '次のスライド';
        this.nextButton.disabled = false;
        this.nextButton.classList.remove('is-page-link');
        this.nextButton.setAttribute('aria-label', `次のスライド「${this.titles[nextIndex + 1]}」へ進む`);
      }
      this.previousButton.setAttribute('aria-label', nextIndex > 0
        ? `前のスライド「${this.titles[nextIndex - 1]}」へ戻る`
        : '最初のスライドです');

      const currentSlide = this.slides[nextIndex];
      if (updateHash) this.updateHash(currentSlide);
      if (focusHeading) currentSlide.querySelector('h1, h2, h3')?.focus({ preventScroll: true });
      window.scrollTo(0, 0);
      this.scheduleMeasure();
      document.dispatchEvent(new CustomEvent('joho:lesson-slide-change', {
        detail: { deck: this, index: nextIndex, count: this.slides.length, title: this.titles[nextIndex], slide: currentSlide }
      }));
    }

    scheduleMeasure() {
      cancelAnimationFrame(this.resizeFrame);
      this.resizeFrame = requestAnimationFrame(() => this.measure());
    }

    measureNavigation() {
      const activeElement = document.activeElement;
      const choiceHadFocus = this.slideChoices.contains(activeElement);
      const selectHadFocus = activeElement === this.slideSelect;
      const gap = parseFloat(getComputedStyle(this.slideChoices).columnGap) || 0;
      const widths = Array.from(this.choiceMeasurements.children, button => {
        const style = getComputedStyle(button);
        const numberWidth = button.querySelector('.lesson-slide-deck__choice-number').getBoundingClientRect().width;
        const compact = Math.max(parseFloat(style.minWidth), numberWidth
          + parseFloat(style.paddingLeft) + parseFloat(style.paddingRight)
          + parseFloat(style.borderLeftWidth) + parseFloat(style.borderRightWidth));
        return { full: button.getBoundingClientRect().width, compact };
      });
      const titleModes = [
        { name: 'all', visible: widths.map(() => true) },
        { name: 'nearby', visible: widths.map((_, index) => index === this.currentIndex || index === this.currentIndex + 1) },
        { name: 'current', visible: widths.map((_, index) => index === this.currentIndex) }
      ];
      const fits = (mode, available) => widths.reduce((total, width, index) =>
        total + (mode.visible[index] ? width.full : width.compact), gap * (widths.length - 1)) <= available - 1;

      // 全タイトルが収まらないときは、まず前後ボタンを矢印表示にして選択肢の幅を確保する。
      this.navigation.classList.remove('has-compact-controls');
      let mode = null;
      if (!window.matchMedia('(max-width: 560px)').matches) {
        if (fits(titleModes[0], this.chooser.getBoundingClientRect().width)) mode = titleModes[0];
        else {
          this.navigation.classList.add('has-compact-controls');
          const available = this.chooser.getBoundingClientRect().width;
          mode = titleModes.find(candidate => fits(candidate, available)) || null;
        }
      }
      // 短いタイトルへ選び直しても、selectでの連続操作中は横並びへ切り替えない。
      if (selectHadFocus && this.preserveSelectFocus) mode = null;

      this.navigation.dataset.lessonSlideNavigation = mode?.name || 'select';
      this.choiceButtons.forEach((button, index) => {
        button.classList.toggle('is-number-only', Boolean(mode && !mode.visible[index]));
      });
      this.slideChoices.hidden = !mode;
      this.slideSelect.hidden = Boolean(mode);
      // リサイズや文字サイズ変更で操作部品が入れ替わっても、フォーカスを失わせない。
      if (!mode && choiceHadFocus) this.slideSelect.focus({ preventScroll: true });
      if (mode && selectHadFocus) this.choiceButtons[this.currentIndex].focus({ preventScroll: true });
    }

    measure() {
      this.measureNavigation();
      const headerHeight = this.siteHeader?.getBoundingClientRect().height || 0;
      this.navigation.style.setProperty('--lesson-slide-header-height', `${headerHeight}px`);
      const top = Math.max(0, this.deck.getBoundingClientRect().top);
      // 折り返したフッターも確保する。全画面時は非表示なので高さは0になる。
      const footerHeight = this.siteFooter?.getBoundingClientRect().height || 0;
      const available = Math.max(300, Math.floor(window.innerHeight - top - footerHeight - 8));
      this.deck.style.setProperty('--lesson-slide-deck-height', `${available}px`);
      this.deck.classList.toggle('is-height-compact', available < 680);
      const currentSlide = this.slides[this.currentIndex];
      const overflowing = currentSlide.scrollHeight > currentSlide.clientHeight + 2;
      this.deck.classList.toggle('has-scrollable-slide', overflowing);
      currentSlide.classList.toggle('is-scrollable', overflowing);
    }
  }

  function initializeViewGroups(scope = document) {
    return Array.from(scope.querySelectorAll?.(VIEW_GROUP_SELECTOR) || []).flatMap(group => {
      if (group.__lessonViewGroup) return [group.__lessonViewGroup];
      try {
        return [new LessonViewGroup(group)];
      } catch (error) {
        console.error('[lesson-slide-deck] view group initialization failed:', error);
        return [];
      }
    });
  }

  function initializeSupplementDialogs(scope = document) {
    const dialogs = Array.from(scope.querySelectorAll?.(SUPPLEMENT_DIALOG_SELECTOR) || []);
    const triggers = Array.from(scope.querySelectorAll?.(SUPPLEMENT_OPEN_SELECTOR) || []);

    dialogs.forEach(dialog => {
      if (dialog.dataset.lessonSupplementReady === 'true') return;
      const source = `lesson-supplement:${dialog.id}`;
      const closeDialog = () => {
        if (typeof dialog.close === 'function') dialog.close();
        else dialog.removeAttribute('open');
      };
      dialog.querySelectorAll('[data-lesson-supplement-close]').forEach(button => {
        button.addEventListener('click', closeDialog);
      });
      dialog.addEventListener('click', event => {
        if (event.target === dialog) closeDialog();
      });
      dialog.addEventListener('keydown', event => {
        if (event.key !== 'Escape') return;
        event.preventDefault();
        closeDialog();
      });
      dialog.addEventListener('close', () => {
        const opener = dialog.__lessonSupplementOpener;
        dialog.__lessonSupplementOpener = null;
        triggers
          .filter(trigger => trigger.dataset.lessonSupplementOpen === dialog.id)
          .forEach(trigger => trigger.setAttribute('aria-expanded', 'false'));
        if (opener instanceof HTMLElement && opener.isConnected) opener.focus({ preventScroll: true });
      });
      document.addEventListener(OVERLAY_OPEN_EVENT, event => {
        if (event.detail?.source !== source && dialog.open) closeDialog();
      });
      dialog.dataset.lessonSupplementReady = 'true';
    });

    triggers.forEach(trigger => {
      if (trigger.dataset.lessonSupplementTriggerReady === 'true') return;
      const dialogId = trigger.dataset.lessonSupplementOpen?.trim();
      const dialog = dialogId ? document.getElementById(dialogId) : null;
      if (!dialog) return;
      trigger.setAttribute('aria-haspopup', 'dialog');
      trigger.setAttribute('aria-controls', dialog.id);
      trigger.setAttribute('aria-expanded', 'false');
      trigger.addEventListener('click', () => {
        if (dialog.open) return;
        const source = `lesson-supplement:${dialog.id}`;
        document.dispatchEvent(new CustomEvent(OVERLAY_OPEN_EVENT, { detail: { source } }));
        dialog.__lessonSupplementOpener = trigger;
        trigger.setAttribute('aria-expanded', 'true');
        if (typeof dialog.showModal === 'function') dialog.showModal();
        else dialog.setAttribute('open', '');
        requestAnimationFrame(() => {
          dialog.querySelector('[data-lesson-supplement-close], button, [href], input, select, textarea')
            ?.focus({ preventScroll: true });
        });
      });
      trigger.dataset.lessonSupplementTriggerReady = 'true';
    });
  }

  function initializeLessonSlideDecks(scope = document) {
    initializeViewGroups(scope);
    initializeSupplementDialogs(scope);
    return Array.from(scope.querySelectorAll?.(PAGE_SELECTOR) || []).flatMap(page => {
      if (page.__lessonSlideDeck) return [page.__lessonSlideDeck];
      if (!document.getElementById('main-content')) return [];
      try {
        return [new LessonSlideDeck(page)];
      } catch (error) {
        console.error('[lesson-slide-deck] initialization failed:', error);
        return [];
      }
    });
  }

  function boot() {
    let attempts = 0;
    const tryInitialize = () => {
      if (initializeLessonSlideDecks().length) return;
      attempts += 1;
      if (attempts < 120) requestAnimationFrame(tryInitialize);
    };
    tryInitialize();
  }

  window.initLessonSlideDecks = initializeLessonSlideDecks;
  if (document.readyState === 'complete') boot();
  else window.addEventListener('load', boot, { once: true });
})();
