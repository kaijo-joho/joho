(() => {
  'use strict';

  const onReady = (callback) => {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', callback, { once: true });
    } else {
      callback();
    }
  };

  onReady(() => {
    const byId = (id) => document.getElementById(id);
    const numberValue = (id) => Number(byId(id).value);
    const setOutput = (id, value) => {
      const output = byId(id);
      if (output) output.value = value;
    };

    const updateLiveCode = (name, source) => {
      const pre = document.querySelector(`[data-live-code="${name}"]`);
      const code = pre?.querySelector('code');
      if (!pre || !code) return;

      code.textContent = source.trim();
      pre.removeAttribute('data-syntax-highlighted');

      if (typeof window.highlightEmbeddedCodeBlocks === 'function') {
        window.highlightEmbeddedCodeBlocks(pre);
      }
    };

    const bindInputs = (ids, update) => {
      ids.forEach((id) => byId(id)?.addEventListener('input', update));
    };

    const bindReset = (name, values, update) => {
      document.querySelector(`[data-reset-lab="${name}"]`)?.addEventListener('click', () => {
        Object.entries(values).forEach(([id, value]) => {
          const control = byId(id);
          if (!control) return;

          if (control.type === 'checkbox') {
            control.checked = Boolean(value);
          } else {
            control.value = String(value);
          }
        });
        update();
      });
    };

    const updatePageLab = () => {
      const maxWidth = numberValue('page-max-width');
      const padding = numberValue('page-padding');
      const preview = byId('page-preview');

      preview.style.maxWidth = `${maxWidth}px`;
      preview.style.padding = `${padding}px`;
      setOutput('page-max-width-output', `${maxWidth}px`);
      setOutput('page-padding-output', `${padding}px`);

      updateLiveCode('page', `.page {
  box-sizing: border-box;
  max-width: ${maxWidth}px;
  margin: 0 auto;
  padding: ${padding}px;
}`);
    };

    bindInputs(['page-max-width', 'page-padding'], updatePageLab);
    bindReset('page', {
      'page-max-width': 600,
      'page-padding': 24
    }, updatePageLab);

    const updateImageLab = () => {
      const stageWidth = numberValue('image-stage-width');
      const ratio = byId('image-ratio').value;
      const fit = byId('image-fit').value;
      const position = numberValue('image-position');
      const viewport = byId('image-viewport');
      const preview = byId('image-preview');

      viewport.style.width = `${stageWidth}px`;
      preview.style.aspectRatio = ratio;
      preview.style.objectFit = fit;
      preview.style.objectPosition = `${position}% center`;
      setOutput('image-stage-width-output', `${stageWidth}px`);
      setOutput('image-position-output', `${position}%`);

      updateLiveCode('image', `.hero-image {
  width: 100%;
  aspect-ratio: ${ratio};
  object-fit: ${fit};
  object-position: ${position}% center;
}`);
    };

    bindInputs([
      'image-stage-width',
      'image-ratio',
      'image-fit',
      'image-position'
    ], updateImageLab);
    bindReset('image', {
      'image-stage-width': 560,
      'image-ratio': '16 / 9',
      'image-fit': 'cover',
      'image-position': 50
    }, updateImageLab);

    const updateFlexLab = () => {
      const stageWidth = numberValue('flex-stage-width');
      const direction = byId('flex-direction').value;
      const gap = numberValue('flex-gap');
      const basis = numberValue('flex-basis');
      const wrap = byId('flex-wrap').checked ? 'wrap' : 'nowrap';
      const viewport = byId('flex-viewport');
      const preview = byId('flex-preview');

      viewport.style.width = `${stageWidth}px`;
      preview.style.flexDirection = direction;
      preview.style.gap = `${gap}px`;
      preview.style.flexWrap = wrap;
      preview.querySelectorAll('.demo-spot-card').forEach((card) => {
        card.style.flex = `1 1 ${basis}px`;
      });

      setOutput('flex-stage-width-output', `${stageWidth}px`);
      setOutput('flex-gap-output', `${gap}px`);
      setOutput('flex-basis-output', `${basis}px`);

      updateLiveCode('flex', `.spot-list {
  display: flex;
  flex-direction: ${direction};
  gap: ${gap}px;
  flex-wrap: ${wrap};
}

.spot-card {
  flex: 1 1 ${basis}px;
}`);
    };

    bindInputs([
      'flex-stage-width',
      'flex-direction',
      'flex-gap',
      'flex-basis',
      'flex-wrap'
    ], updateFlexLab);
    bindReset('flex', {
      'flex-stage-width': 600,
      'flex-direction': 'row',
      'flex-gap': 16,
      'flex-basis': 180,
      'flex-wrap': true
    }, updateFlexLab);

    const shadowValues = {
      none: 'none',
      soft: '0 6px 18px rgba(0, 0, 0, 0.14)',
      strong: '0 14px 32px rgba(0, 0, 0, 0.28)'
    };

    const hexToRgb = (hex) => {
      const normalized = hex.replace('#', '');
      return [0, 2, 4].map((offset) => Number.parseInt(normalized.slice(offset, offset + 2), 16));
    };

    const relativeLuminance = (hex) => {
      const channels = hexToRgb(hex).map((channel) => {
        const value = channel / 255;
        return value <= 0.04045
          ? value / 12.92
          : Math.pow((value + 0.055) / 1.055, 2.4);
      });
      return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
    };

    const readableTextColor = (background) => {
      const luminance = relativeLuminance(background);
      const whiteContrast = 1.05 / (luminance + 0.05);
      const darkContrast = (luminance + 0.05) / 0.05;
      return whiteContrast > darkContrast ? '#ffffff' : '#1b2733';
    };

    const updateCardLab = () => {
      const background = byId('card-color').value.toLowerCase();
      const padding = numberValue('card-padding');
      const radius = numberValue('card-radius');
      const shadowName = byId('card-shadow').value;
      const shadow = shadowValues[shadowName] || shadowValues.soft;
      const textColor = readableTextColor(background);
      const preview = byId('card-preview');

      preview.style.backgroundColor = background;
      preview.style.color = textColor;
      preview.style.padding = `${padding}px`;
      preview.style.borderRadius = `${radius}px`;
      preview.style.boxShadow = shadow;

      setOutput('card-padding-output', `${padding}px`);
      setOutput('card-radius-output', `${radius}px`);

      updateLiveCode('card', `.info-card {
  background-color: ${background};
  color: ${textColor};
  padding: ${padding}px;
  border-radius: ${radius}px;
  box-shadow: ${shadow};
}`);
    };

    bindInputs(['card-color', 'card-padding', 'card-radius', 'card-shadow'], updateCardLab);
    bindReset('card', {
      'card-color': '#e5f1ff',
      'card-padding': 24,
      'card-radius': 16,
      'card-shadow': 'soft'
    }, updateCardLab);

    const updateMediaLab = () => {
      const stageWidth = numberValue('media-stage-width');
      const breakpoint = numberValue('media-breakpoint');
      const isNarrow = stageWidth <= breakpoint;
      const viewport = byId('media-viewport');
      const preview = byId('media-preview');

      viewport.style.width = `${stageWidth}px`;
      preview.classList.toggle('is-narrow', isNarrow);
      setOutput('media-stage-width-output', `${stageWidth}px`);
      setOutput('media-breakpoint-output', `${breakpoint}px`);
      byId('media-state').textContent = isNarrow
        ? '現在は1列表示です。'
        : '現在は2列表示です。';

      updateLiveCode('media', `.spot-layout {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px;
}

@media (max-width: ${breakpoint}px) {
  .spot-layout {
    grid-template-columns: 1fr;
  }
}`);
    };

    bindInputs(['media-stage-width', 'media-breakpoint'], updateMediaLab);
    bindReset('media', {
      'media-stage-width': 640,
      'media-breakpoint': 520
    }, updateMediaLab);

    const updateLinkLab = () => {
      const lift = numberValue('link-lift');
      const duration = numberValue('link-duration');
      const fixed = byId('link-fixed').checked;
      const preview = byId('link-preview');

      preview.style.setProperty('--demo-link-lift', `${lift}px`);
      preview.style.setProperty('--demo-link-duration', `${duration}ms`);
      preview.classList.toggle('is-active', fixed);
      setOutput('link-lift-output', `${lift}px`);
      setOutput('link-duration-output', `${duration}ms`);

      updateLiveCode('link', `.detail-link {
  transition: transform ${duration}ms ease,
              background-color ${duration}ms ease;
}

.detail-link:hover,
.detail-link:focus-visible {
  transform: translateY(-${lift}px);
  background-color: #17456f;
}`);
    };

    bindInputs(['link-lift', 'link-duration', 'link-fixed'], updateLinkLab);
    bindReset('link', {
      'link-lift': 3,
      'link-duration': 200,
      'link-fixed': false
    }, updateLinkLab);

    const semanticDescriptions = {
      all: 'ページ全体の構造を表示しています。',
      header: 'headerは、ページ上部のタイトルや導入部分を表します。',
      nav: 'navは、ページ内や他ページへ移動する主要なリンクをまとめます。',
      main: 'mainは、そのページの中心となる内容を表します。',
      section: 'sectionは、見出しと内容からなる一つのまとまりを表します。',
      footer: 'footerは、ページ下部の補足情報などを表します。'
    };

    const updateSemanticLab = () => {
      const selected = byId('semantic-part').value;
      const preview = byId('semantic-preview');
      const isFiltering = selected !== 'all';

      preview.classList.toggle('is-filtering', isFiltering);
      preview.querySelectorAll('[data-semantic-part]').forEach((part) => {
        part.classList.toggle('is-highlighted', isFiltering && part.dataset.semanticPart === selected);
      });
      byId('semantic-state').textContent = semanticDescriptions[selected] || semanticDescriptions.all;
    };

    bindInputs(['semantic-part'], updateSemanticLab);
    bindReset('semantic', {
      'semantic-part': 'all'
    }, updateSemanticLab);

    updatePageLab();
    updateImageLab();
    updateFlexLab();
    updateCardLab();
    updateMediaLab();
    updateLinkLab();
    updateSemanticLab();
  });
})();
