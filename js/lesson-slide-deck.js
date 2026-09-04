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
    const explicitUrl = page.dataset.lessonSlideNextUrl?.trim();
    if (explicitUrl) {
      return {
        url: explicitUrl,
        label: page.dataset.lessonSlideNextLabel?.trim() || '次の教材へ'
      };
    }

    const metadata = window.pages?.[page.dataset.lessonPageId?.trim() || currentPageId()];
    const candidates = Array.isArray(metadata?.next) ? metadata.next : [];
    const next = candidates.find(item => item && typeof item.url === 'string' && item.url.trim());
    if (next) {
      return {
        url: next.url.trim(),
        label: String(next.text || next.title || '次の教材へ').trim()
      };
    }

    const generatedLink = document.querySelector('#next_page a[href]');
    return generatedLink
      ? { url: generatedLink.href, label: generatedLink.textContent?.trim() || '次の教材へ' }
      : { url: '', label: '次の教材へ' };
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

      this.id = `lesson-slide-deck-${++deckSequence}`;
      this.currentIndex = 0;
      this.titles = this.slides.map(titleForSlide);
      this.nextLesson = nextLesson(page);
      this.resizeFrame = 0;
      this.resizeObserver = null;
      this.contentObserver = null;

      this.build();
      this.bind();
      this.page.__lessonSlideDeck = this;
      this.page.classList.add('lesson-slide-ready');

      const requestedIndex = this.indexFromHash(location.hash);
      this.show(requestedIndex >= 0 ? requestedIndex : 0, { updateHash: false });
      this.scheduleMeasure();
    }

    build() {
      this.deck = createElement('div', 'lesson-slide-deck');
      this.deck.id = this.id;
      this.deck.setAttribute('role', 'region');
      this.deck.setAttribute('aria-roledescription', 'スライド教材');
      this.deck.setAttribute('aria-label', document.querySelector('#title')?.textContent?.trim() || '座学教材');
      this.deck.style.setProperty('--lesson-slide-count', String(this.slides.length));

      this.viewport = createElement('div', 'lesson-slide-deck__viewport');
      this.viewport.setAttribute('aria-live', 'off');
      const firstSlide = this.slides[0];
      firstSlide.before(this.deck);

      this.slides.forEach((slide, index) => {
        const heading = slide.querySelector('h1, h2, h3');
        if (!slide.id) slide.id = `${this.id}-slide-${index + 1}`;
        slide.classList.add('lesson-slide');
        slide.dataset.lessonSlideIndex = String(index);
        slide.setAttribute('role', 'group');
        slide.setAttribute('aria-roledescription', 'スライド');
        slide.setAttribute('aria-label', `${index + 1} / ${this.slides.length}：${this.titles[index]}`);
        slide.hidden = true;
        if (heading && !heading.hasAttribute('tabindex')) heading.tabIndex = -1;
        this.viewport.appendChild(slide);
      });

      this.navigation = createElement('nav', 'lesson-slide-deck__navigation');
      this.navigation.setAttribute('aria-label', 'スライドの操作と進行状況');
      this.previousButton = this.makeNavigationButton('previous', '←', '戻る');
      this.nextButton = this.makeNavigationButton('next', '→', '次へ');

      const progress = createElement('div', 'lesson-slide-deck__progress');
      const progressHeading = createElement('div', 'lesson-slide-deck__progress-heading');
      this.counter = createElement('output', 'lesson-slide-deck__counter');
      this.counter.setAttribute('aria-live', 'polite');
      this.counter.setAttribute('aria-atomic', 'true');
      this.currentTitle = createElement('strong', 'lesson-slide-deck__current-title');
      progressHeading.append(this.counter, this.currentTitle);

      this.stepList = createElement('ol', 'lesson-slide-deck__steps');
      this.stepButtons = this.slides.map((slide, index) => {
        const item = createElement('li', 'lesson-slide-deck__step');
        const button = createElement('button', 'lesson-slide-deck__step-button');
        const number = createElement('span', 'lesson-slide-deck__step-number', String(index + 1));
        const label = createElement('span', 'lesson-slide-deck__step-label', this.titles[index]);
        button.type = 'button';
        button.setAttribute('aria-label', `スライド${index + 1}「${this.titles[index]}」へ移動`);
        button.setAttribute('aria-controls', slide.id);
        button.append(number, label);
        button.addEventListener('click', () => this.show(index, { focusHeading: true }));
        item.appendChild(button);
        this.stepList.appendChild(item);
        return button;
      });

      progress.append(progressHeading, this.stepList);
      this.navigation.append(this.previousButton, progress, this.nextButton);
      this.deck.append(this.viewport, this.navigation);
    }

    makeNavigationButton(direction, symbol, label) {
      const button = createElement('button', `lesson-slide-deck__button lesson-slide-deck__button--${direction}`);
      const symbolNode = createElement('span', 'lesson-slide-deck__button-symbol', symbol);
      const labelNode = createElement('span', 'lesson-slide-deck__button-label', label);
      button.type = 'button';
      button.append(symbolNode, labelNode);
      return button;
    }

    bind() {
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
      window.addEventListener('resize', () => this.scheduleMeasure(), { passive: true });
      document.addEventListener('joho:text-size-change', () => this.scheduleMeasure());
      document.addEventListener(CONTENT_RESIZE_EVENT, () => this.scheduleMeasure());

      if (typeof ResizeObserver === 'function') {
        this.resizeObserver = new ResizeObserver(() => this.scheduleMeasure());
        [document.getElementById('site-header'), document.getElementById('page_header'), this.deck]
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
      this.stepButtons.forEach((button, buttonIndex) => {
        const active = buttonIndex === nextIndex;
        button.setAttribute('aria-current', active ? 'step' : 'false');
        button.classList.toggle('is-current', active);
        button.classList.toggle('is-complete', buttonIndex < nextIndex);
      });

      this.counter.value = `${nextIndex + 1} / ${this.slides.length}`;
      this.counter.textContent = `${nextIndex + 1} / ${this.slides.length}`;
      this.currentTitle.textContent = this.titles[nextIndex];
      this.previousButton.disabled = nextIndex === 0;

      const last = nextIndex === this.slides.length - 1;
      const nextLabel = this.nextButton.querySelector('.lesson-slide-deck__button-label');
      if (last) {
        nextLabel.textContent = this.nextLesson.url ? this.nextLesson.label : '完了';
        this.nextButton.disabled = !this.nextLesson.url;
        this.nextButton.classList.toggle('is-page-link', Boolean(this.nextLesson.url));
        this.nextButton.setAttribute('aria-label', this.nextLesson.url
          ? `${this.nextLesson.label}：次のページへ進む`
          : 'この教材は完了です');
      } else {
        nextLabel.textContent = '次へ';
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

    measure() {
      const top = Math.max(0, this.deck.getBoundingClientRect().top);
      const available = Math.max(300, Math.floor(window.innerHeight - top - 8));
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
