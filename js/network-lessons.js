// ./js/network-lessons.js
(() => {
  'use strict';

  const GROUP_SELECTOR = '[data-network-reveal-group]';
  const REVEAL_SELECTOR = '[data-network-reveal]';
  const CONTENT_RESIZE_EVENT = 'joho:lesson-content-resize';

  function revealNumber(button, fallbackIndex) {
    return button.querySelector('.nw-reveal__number')?.textContent?.trim() || String(fallbackIndex + 1);
  }

  function answerText(button) {
    return button.querySelector('.nw-reveal__answer')?.textContent?.trim() || '';
  }

  function notifyContentResize() {
    document.dispatchEvent(new CustomEvent(CONTENT_RESIZE_EVENT));
  }

  class NetworkRevealGroup {
    constructor(group) {
      if (!(group instanceof HTMLElement)) throw new TypeError('穴埋めのグループが必要です。');
      if (group.__networkRevealGroup) return group.__networkRevealGroup;

      this.group = group;
      this.buttons = Array.from(group.querySelectorAll(REVEAL_SELECTOR));
      this.toolbar = group.querySelector('[data-network-reveal-toolbar]');
      this.progress = this.toolbar?.querySelector('[data-network-reveal-progress]') || null;
      this.allButton = this.toolbar?.querySelector('[data-network-reveal-all]') || null;
      this.resetButton = this.toolbar?.querySelector('[data-network-reveal-reset]') || null;

      if (!this.buttons.length) throw new Error('穴埋めボタンが見つかりません。');

      this.prepare();
      this.bind();
      this.updateControls();
      group.__networkRevealGroup = this;
    }

    prepare() {
      this.buttons.forEach((button, index) => {
        const prompt = button.querySelector('.nw-reveal__prompt');
        const answer = button.querySelector('.nw-reveal__answer');
        const number = revealNumber(button, index);

        button.type = 'button';
        button.dataset.networkRevealReady = 'true';
        button.setAttribute('aria-pressed', 'false');
        button.setAttribute('aria-label', `空欄${number}の答えを表示`);
        button.classList.remove('is-revealed');
        if (prompt) prompt.hidden = false;
        if (answer) answer.hidden = true;
      });

      if (this.toolbar) this.toolbar.hidden = false;
    }

    bind() {
      this.buttons.forEach((button, index) => {
        button.addEventListener('click', () => this.reveal(button, index));
        button.addEventListener('keydown', event => {
          if (event.key !== 'Enter' && event.key !== ' ') return;
          event.preventDefault();
          this.reveal(button, index);
        });
      });

      this.allButton?.addEventListener('click', () => {
        this.buttons.forEach((button, index) => this.setRevealed(button, index, true));
        this.updateControls();
        notifyContentResize();
      });

      this.resetButton?.addEventListener('click', () => {
        this.buttons.forEach((button, index) => this.setRevealed(button, index, false));
        this.updateControls();
        notifyContentResize();
      });
    }

    setRevealed(button, index, revealed) {
      const prompt = button.querySelector('.nw-reveal__prompt');
      const answer = button.querySelector('.nw-reveal__answer');
      const number = revealNumber(button, index);
      const answerLabel = answerText(button);

      button.classList.toggle('is-revealed', revealed);
      button.setAttribute('aria-pressed', String(revealed));
      button.setAttribute(
        'aria-label',
        revealed ? `空欄${number}の答え：${answerLabel}` : `空欄${number}の答えを表示`
      );
      if (prompt) prompt.hidden = revealed;
      if (answer) answer.hidden = !revealed;
    }

    reveal(button, index) {
      if (button.classList.contains('is-revealed')) return;
      this.setRevealed(button, index, true);
      this.updateControls();
      notifyContentResize();
    }

    updateControls() {
      const revealedCount = this.buttons.filter(button => button.classList.contains('is-revealed')).length;
      if (this.progress) this.progress.textContent = `${revealedCount} / ${this.buttons.length}`;
      if (this.allButton) this.allButton.disabled = revealedCount === this.buttons.length;
      if (this.resetButton) this.resetButton.disabled = revealedCount === 0;
    }
  }

  function initialize() {
    document.querySelectorAll(GROUP_SELECTOR).forEach(group => {
      try {
        new NetworkRevealGroup(group);
      } catch (error) {
        console.warn('ネットワーク教材の穴埋めを初期化できませんでした。', error);
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize, { once: true });
  } else {
    initialize();
  }
})();
