// ./js/dr-slide-deck.js
(() => {
  'use strict';

  const PAGE_SELECTOR = '[data-dr-slide-deck]';
  const SLIDE_SELECTOR = '[data-dr-slide]';
  const INTERACTIVE_SELECTOR = [
    'a',
    'button',
    'input',
    'select',
    'textarea',
    'summary',
    '[contenteditable="true"]',
    '[role="button"]',
    '[role="slider"]',
    '[role="tab"]'
  ].join(',');

  let deckSequence = 0;

  function element(tagName, className = '', text = '') {
    const node = document.createElement(tagName);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  }

  function slideTitle(slide, index) {
    const explicit = slide.dataset.drSlideTitle?.trim();
    if (explicit) return explicit;
    const heading = slide.querySelector('h1, h2, h3');
    return heading?.textContent?.trim() || `スライド ${index + 1}`;
  }

  function isKeyboardNavigationTarget(target) {
    return target instanceof Element && Boolean(target.closest(INTERACTIVE_SELECTOR));
  }

  class DrSlideDeck {
    constructor(page) {
      if (!(page instanceof HTMLElement)) throw new TypeError('スライドページが必要です。');
      if (page.__drSlideDeck) return page.__drSlideDeck;

      this.page = page;
      this.slides = Array.from(page.querySelectorAll(SLIDE_SELECTOR));
      if (this.slides.length < 2) throw new Error('スライドは2枚以上必要です。');

      this.id = `dr-slide-deck-${++deckSequence}`;
      this.currentIndex = 0;
      this.titles = this.slides.map(slideTitle);
      this.nextUrl = page.dataset.drSlideNextUrl?.trim() || '';
      this.nextLabel = page.dataset.drSlideNextLabel?.trim() || '次の教材へ';
      this.resizeObserver = null;
      this.resizeFrame = 0;

      this.build();
      this.bind();
      this.page.__drSlideDeck = this;
      this.page.classList.add('dr-slide-ready');

      const requestedIndex = this.indexFromHash(location.hash);
      this.show(requestedIndex >= 0 ? requestedIndex : 0, { updateHash: false });
      this.scheduleMeasure();
    }

    build() {
      this.deck = element('div', 'dr-slide-deck');
      this.deck.id = this.id;
      this.deck.setAttribute('role', 'region');
      this.deck.setAttribute('aria-roledescription', 'スライド教材');
      this.deck.setAttribute('aria-label', document.querySelector('#title')?.textContent?.trim() || 'デジタル表現教材');
      this.deck.style.setProperty('--dr-slide-count', String(this.slides.length));

      this.viewport = element('div', 'dr-slide-deck__viewport');
      this.viewport.setAttribute('aria-live', 'off');

      const firstSlide = this.slides[0];
      firstSlide.before(this.deck);
      this.slides.forEach((slide, index) => {
        const heading = slide.querySelector('h1, h2, h3');
        if (!slide.id) slide.id = `${this.id}-slide-${index + 1}`;
        slide.classList.add('dr-slide');
        slide.dataset.drSlideIndex = String(index);
        slide.setAttribute('role', 'group');
        slide.setAttribute('aria-roledescription', 'スライド');
        slide.setAttribute('aria-label', `${index + 1} / ${this.slides.length}：${this.titles[index]}`);
        slide.hidden = true;
        if (heading && !heading.hasAttribute('tabindex')) heading.tabIndex = -1;
        this.viewport.appendChild(slide);
      });

      this.navigation = element('nav', 'dr-slide-deck__navigation');
      this.navigation.setAttribute('aria-label', 'スライドの操作と進行状況');

      this.previousButton = this.makeNavigationButton('previous', '←', '戻る');
      this.nextButton = this.makeNavigationButton('next', '→', '次へ');

      const progress = element('div', 'dr-slide-deck__progress');
      const progressHeading = element('div', 'dr-slide-deck__progress-heading');
      this.counter = element('output', 'dr-slide-deck__counter');
      this.counter.setAttribute('aria-live', 'polite');
      this.counter.setAttribute('aria-atomic', 'true');
      this.currentTitle = element('strong', 'dr-slide-deck__current-title');
      progressHeading.append(this.counter, this.currentTitle);

      this.stepList = element('ol', 'dr-slide-deck__steps');
      this.stepButtons = this.slides.map((slide, index) => {
        const item = element('li', 'dr-slide-deck__step');
        const button = element('button', 'dr-slide-deck__step-button');
        const number = element('span', 'dr-slide-deck__step-number', String(index + 1));
        const label = element('span', 'dr-slide-deck__step-label', this.titles[index]);
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
      const button = element('button', `dr-slide-deck__button dr-slide-deck__button--${direction}`);
      const symbolNode = element('span', 'dr-slide-deck__button-symbol', symbol);
      const labelNode = element('span', 'dr-slide-deck__button-label', label);
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
        if (this.nextUrl) location.assign(this.nextUrl);
      });

      document.addEventListener('keydown', event => {
        if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
        if (isKeyboardNavigationTarget(event.target)) return;
        if (event.key === 'ArrowRight' || event.key === 'PageDown') {
          if (this.currentIndex >= this.slides.length - 1 && !this.nextUrl) return;
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
        const index = this.indexFromHash(location.hash);
        if (index >= 0 && index !== this.currentIndex) this.show(index, { updateHash: false });
      });
      window.addEventListener('resize', () => this.scheduleMeasure(), { passive: true });
      document.addEventListener('joho:text-size-change', () => this.scheduleMeasure());
      document.addEventListener('dr:content-resize', () => this.scheduleMeasure());

      if (typeof ResizeObserver === 'function') {
        this.resizeObserver = new ResizeObserver(() => this.scheduleMeasure());
        [document.getElementById('site-header'), document.getElementById('page_header')]
          .filter(Boolean)
          .forEach(node => this.resizeObserver.observe(node));
      }
    }

    indexFromHash(hash) {
      if (!hash || hash === '#') return -1;
      let id = '';
      try {
        id = decodeURIComponent(hash.slice(1));
      } catch {
        id = hash.slice(1);
      }
      return this.slides.findIndex(slide =>
        slide.id === id || Array.from(slide.querySelectorAll('[id]')).some(node => node.id === id)
      );
    }

    updateHash(slide) {
      const heading = slide.querySelector('[id]');
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
      this.page.classList.toggle('dr-slide-page--intro', nextIndex === 0);
      this.page.classList.toggle('dr-slide-page--content', nextIndex > 0);

      this.slides.forEach((slide, slideIndex) => {
        const active = slideIndex === nextIndex;
        slide.hidden = !active;
        slide.setAttribute('aria-hidden', String(!active));
        slide.classList.toggle('is-current', active);
        if (active) slide.scrollTop = 0;
      });

      this.stepButtons.forEach((button, buttonIndex) => {
        const active = buttonIndex === nextIndex;
        const complete = buttonIndex < nextIndex;
        button.setAttribute('aria-current', active ? 'step' : 'false');
        button.classList.toggle('is-current', active);
        button.classList.toggle('is-complete', complete);
      });

      this.counter.value = `${nextIndex + 1} / ${this.slides.length}`;
      this.counter.textContent = `${nextIndex + 1} / ${this.slides.length}`;
      this.currentTitle.textContent = this.titles[nextIndex];
      this.previousButton.disabled = nextIndex === 0;

      const isLast = nextIndex === this.slides.length - 1;
      const nextLabel = this.nextButton.querySelector('.dr-slide-deck__button-label');
      if (isLast) {
        nextLabel.textContent = this.nextUrl ? this.nextLabel : '完了';
        this.nextButton.disabled = !this.nextUrl;
        this.nextButton.classList.toggle('is-page-link', Boolean(this.nextUrl));
        this.nextButton.setAttribute('aria-label', this.nextUrl ? `${this.nextLabel}：次のページへ進む` : 'この教材は完了です');
      } else {
        nextLabel.textContent = '次へ';
        this.nextButton.disabled = false;
        this.nextButton.classList.remove('is-page-link');
        this.nextButton.setAttribute('aria-label', `次のスライド「${this.titles[nextIndex + 1]}」へ進む`);
      }
      this.previousButton.setAttribute(
        'aria-label',
        nextIndex > 0 ? `前のスライド「${this.titles[nextIndex - 1]}」へ戻る` : '最初のスライドです'
      );

      const currentSlide = this.slides[nextIndex];
      if (updateHash) this.updateHash(currentSlide);
      if (focusHeading) currentSlide.querySelector('h1, h2, h3')?.focus({ preventScroll: true });
      this.scheduleMeasure();
      document.dispatchEvent(new CustomEvent('dr:slide-change', {
        detail: { index: nextIndex, count: this.slides.length, title: this.titles[nextIndex] }
      }));
    }

    scheduleMeasure() {
      cancelAnimationFrame(this.resizeFrame);
      this.resizeFrame = requestAnimationFrame(() => this.measure());
    }

    measure() {
      window.scrollTo(0, 0);
      const top = Math.max(0, this.deck.getBoundingClientRect().top);
      const available = Math.max(280, Math.floor(window.innerHeight - top - 8));
      this.deck.style.setProperty('--dr-slide-deck-height', `${available}px`);
      this.deck.classList.toggle('is-height-compact', available < 760);

      const currentSlide = this.slides[this.currentIndex];
      const scrollable = currentSlide.scrollHeight > currentSlide.clientHeight + 2;
      this.deck.classList.toggle('has-scrollable-slide', scrollable);
      currentSlide.classList.toggle('is-scrollable', scrollable);
    }
  }

  function initializeDrSlideDeck(scope = document) {
    const page = scope.querySelector?.(PAGE_SELECTOR);
    if (!page || page.__drSlideDeck) return page?.__drSlideDeck || null;
    if (!document.getElementById('main-content')) return null;
    try {
      return new DrSlideDeck(page);
    } catch (error) {
      console.error('[dr-slide-deck] initialization failed:', error);
      return null;
    }
  }

  function boot() {
    let attempts = 0;
    const tryInitialize = () => {
      if (initializeDrSlideDeck()) return;
      attempts += 1;
      if (attempts < 120) requestAnimationFrame(tryInitialize);
    };
    tryInitialize();
  }

  window.DrSlideDeck = DrSlideDeck;
  window.initDrSlideDeck = initializeDrSlideDeck;

  if (document.readyState === 'complete') boot();
  else window.addEventListener('load', boot, { once: true });
})();
