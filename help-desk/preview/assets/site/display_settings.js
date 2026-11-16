// 表示だけの共通設定。main.jsや教材データを使わず単独でも読み込める。
(() => {
  'use strict';
  if (window.siteDisplaySettings?.version === 1) return;

  const SITE_THEME_STORAGE_KEY = 'joho.siteTheme';
  const SITE_THEME_OPTIONS = ['system', 'light', 'dark'];
  const SITE_TEXT_SIZE_STORAGE_KEY = 'joho.textSize';
  const SITE_TEXT_SIZE_OPTIONS = ['standard', 'large', 'xlarge'];
  const SITE_TEXT_SIZE_SCALES = { standard: 100, large: 110, xlarge: 120 };
  const SITE_DISPLAY_STORAGE_KEY = 'joho.displaySettings';

  const nearestTextSize = scale => SITE_TEXT_SIZE_OPTIONS.reduce((nearest, value) =>
    Math.abs(SITE_TEXT_SIZE_SCALES[value] - scale) < Math.abs(SITE_TEXT_SIZE_SCALES[nearest] - scale)
      ? value : nearest, 'standard');

  function readDisplayRecord() {
    try {
      const value = JSON.parse(localStorage.getItem(SITE_DISPLAY_STORAGE_KEY));
      return value?.version === 1 && typeof value === 'object' ? value : {};
    } catch { return {}; }
  }

  function storedTextScale(legacyPreference) {
    const record = readDisplayRecord();
    // 新旧キーを続けて保存したタブからの通知では微調整値を保ち、
    // 旧キーだけが別段階へ更新されたときは、その段階を優先する。
    if (typeof record.textScale === 'number' && Number.isFinite(record.textScale) && nearestTextSize(record.textScale) === legacyPreference) {
      return Math.max(90, Math.min(150, Math.round(record.textScale)));
    }
    return SITE_TEXT_SIZE_SCALES[legacyPreference] || 100;
  }

  function storeDisplayValue(key, value) {
    try {
      if (value === null) localStorage.removeItem(key);
      else localStorage.setItem(key, value);
    } catch { /* 保存できない環境でも、この文書の表示設定は利用できる。 */ }
  }

  function storeDisplayRecord(patch) {
    const previous = readDisplayRecord();
    const value = { version: 1 };
    for (const key of ['textScale', 'codeWrap', 'lineSpacing']) {
      if (Object.hasOwn(patch, key)) value[key] = patch[key];
      else if (Object.hasOwn(previous, key)) value[key] = previous[key];
    }
    storeDisplayValue(SITE_DISPLAY_STORAGE_KEY, JSON.stringify(value));
  }

  function initializeSiteTheme() {
    const root = document.documentElement;
    const systemDark = typeof window.matchMedia === 'function'
      ? window.matchMedia('(prefers-color-scheme: dark)')
      : { matches: false };
    let preference = 'system';

    try {
      const stored = localStorage.getItem(SITE_THEME_STORAGE_KEY);
      if (SITE_THEME_OPTIONS.includes(stored)) preference = stored;
    } catch {}

    const resolvedTheme = () =>
      preference === 'system' ? (systemDark.matches ? 'dark' : 'light') : preference;

    const applyPreference = () => {
      const resolved = resolvedTheme();
      root.dataset.themePreference = preference;
      root.dataset.resolvedTheme = resolved;

      if (preference === 'system') {
        delete root.dataset.theme;
        root.style.colorScheme = 'light dark';
      } else {
        root.dataset.theme = preference;
        root.style.colorScheme = preference;
      }

      let themeColor = document.head.querySelector('meta[name="theme-color"]');
      if (!themeColor) {
        themeColor = document.createElement('meta');
        themeColor.name = 'theme-color';
        document.head.appendChild(themeColor);
      }
      themeColor.content = resolved === 'dark' ? '#0b0b0b' : '#f3f3f3';

      document.dispatchEvent(new CustomEvent('joho:theme-change', {
        detail: { preference, resolvedTheme: resolved }
      }));
    };

    const setPreference = (value, { persist = true } = {}) => {
      preference = SITE_THEME_OPTIONS.includes(value) ? value : 'system';

      if (persist) {
        try {
          if (preference === 'system') localStorage.removeItem(SITE_THEME_STORAGE_KEY);
          else localStorage.setItem(SITE_THEME_STORAGE_KEY, preference);
        } catch {}
      }

      applyPreference();
    };

    const handleSystemThemeChange = () => {
      if (preference === 'system') applyPreference();
    };
    if (typeof systemDark.addEventListener === 'function') {
      systemDark.addEventListener('change', handleSystemThemeChange);
    } else if (typeof systemDark.addListener === 'function') {
      systemDark.addListener(handleSystemThemeChange);
    }

    window.addEventListener('storage', event => {
      if (event.key !== null && event.key !== SITE_THEME_STORAGE_KEY) return;
      setPreference(event.newValue || 'system', { persist: false });
    });

    applyPreference();

    return {
      get preference() { return preference; },
      get resolvedTheme() { return resolvedTheme(); },
      setPreference
    };
  }

  if (!window.siteTheme) window.siteTheme = initializeSiteTheme();

  function initializeSiteTextSize() {
    const root = document.documentElement;
    let scale = 100;
    let legacyPreference = 'standard';

    try {
      const stored = localStorage.getItem(SITE_TEXT_SIZE_STORAGE_KEY);
      if (SITE_TEXT_SIZE_OPTIONS.includes(stored)) legacyPreference = stored;
    } catch {}
    scale = storedTextScale(legacyPreference);

    const preference = () => nearestTextSize(scale);

    const applyPreference = () => {
      root.dataset.textSize = preference();
      root.dataset.textScale = String(scale);
      root.style.setProperty('--site-text-scale', String(scale / 100));
      // 3つの既存CSS値の間を補間し、旧プリセットの見え方をそのまま再現する。
      root.style.setProperty('--site-size-lower', String(Math.min(1, (scale - 100) / 10)));
      root.style.setProperty('--site-size-upper', String(Math.max(0, (scale - 110) / 10)));
      document.dispatchEvent(new CustomEvent('joho:text-size-change', {
        detail: { preference: preference(), scale }
      }));
    };

    const setScale = (value, { persist = true } = {}) => {
      if (typeof value !== 'number' || !Number.isFinite(value)) return scale;
      scale = Math.max(90, Math.min(150, Math.round(value)));
      if (persist) {
        // 受信側が旧キーの通知を処理する前に、丸め前の値を保存しておく。
        storeDisplayRecord({ textScale: scale });
        storeDisplayValue(SITE_TEXT_SIZE_STORAGE_KEY, preference() === 'standard' ? null : preference());
      }
      applyPreference();
      return scale;
    };
    const setPreference = (value, options) => setScale(SITE_TEXT_SIZE_SCALES[value] || 100, options);

    window.addEventListener('storage', event => {
      if (event.key === SITE_TEXT_SIZE_STORAGE_KEY) {
        const legacy = SITE_TEXT_SIZE_OPTIONS.includes(event.newValue) ? event.newValue : 'standard';
        setScale(storedTextScale(legacy), { persist: false });
      } else if (event.key === null) {
        setScale(100, { persist: false });
      }
    });

    applyPreference();

    return {
      get preference() { return preference(); },
      get scale() { return scale; },
      setPreference,
      setScale
    };
  }

  if (!window.siteTextSize) window.siteTextSize = initializeSiteTextSize();

  function initializeSiteDisplaySettings() {
    const root = document.documentElement;
    const initial = readDisplayRecord();
    let explicitWrap = typeof initial.codeWrap === 'boolean' ? initial.codeWrap : null;
    let lineSpacing = initial.lineSpacing === 'relaxed' ? 'relaxed' : 'standard';
    let embeddedLesson = root.classList.contains('html-practice-embedded');
    let contextOverride = null;
    let batching = false;
    const getState = () => ({
      version: 1,
      textScale: window.siteTextSize.scale || SITE_TEXT_SIZE_SCALES[window.siteTextSize.preference] || 100,
      textSize: window.siteTextSize.preference,
      codeWrap: explicitWrap ?? embeddedLesson,
      codeWrapExplicit: explicitWrap !== null,
      lineSpacing,
      theme: window.siteTheme.preference,
      resolvedTheme: window.siteTheme.resolvedTheme
    });
    let previous = getState();
    const publish = (source = 'api', force = []) => {
      if (batching) return getState();
      const state = getState();
      root.dataset.codeWrap = String(state.codeWrap);
      root.dataset.lineSpacing = state.lineSpacing;
      root.style.setProperty('--site-code-line-height', state.lineSpacing === 'relaxed' ? '2' : '1.7');
      const changed = [...new Set([...Object.keys(state).filter(key => state[key] !== previous[key]), ...force])];
      previous = state;
      if (changed.length) document.dispatchEvent(new CustomEvent('joho:display-settings-change', {
        detail: { state: { ...state }, changed, source }
      }));
      return { ...state };
    };
    const setPreferences = (patch = {}, { persist = true, source = 'api' } = {}) => {
      if (!patch || typeof patch !== 'object') return getState();
      batching = true;
      try {
        if (typeof patch.textScale === 'number' && Number.isFinite(patch.textScale)) {
          window.siteTextSize.setScale?.(patch.textScale, { persist });
        }
        if (typeof patch.codeWrap === 'boolean' || patch.codeWrap === null) explicitWrap = patch.codeWrap;
        if (['standard', 'relaxed'].includes(patch.lineSpacing)) lineSpacing = patch.lineSpacing;
        if (SITE_THEME_OPTIONS.includes(patch.theme)) window.siteTheme.setPreference(patch.theme, { persist });
        if (persist) storeDisplayRecord({ textScale: getState().textScale, codeWrap: explicitWrap, lineSpacing });
      } finally { batching = false; }
      return publish(source, source === 'ui' ? Object.keys(patch).filter(key => ['textScale', 'codeWrap'].includes(key)) : []);
    };
    const reset = ({ persist = true } = {}) => {
      setPreferences({ textScale: 100, codeWrap: null, lineSpacing: 'standard', theme: 'system' }, { persist: false, source: 'reset' });
      if (persist) {
        for (const key of [SITE_THEME_STORAGE_KEY, SITE_TEXT_SIZE_STORAGE_KEY, SITE_DISPLAY_STORAGE_KEY]) storeDisplayValue(key, null);
      }
      return publish('reset', ['reset']);
    };
    const setContext = ({ embeddedLesson: value } = {}) => {
      if (typeof value === 'boolean') { contextOverride = value; embeddedLesson = value; }
      return publish('context');
    };
    document.addEventListener('joho:text-size-change', () => publish('legacy-text-size'));
    document.addEventListener('joho:theme-change', () => publish('legacy-theme'));
    window.addEventListener('storage', event => {
      if (event.key !== null && event.key !== SITE_DISPLAY_STORAGE_KEY) return;
      const record = readDisplayRecord();
      setPreferences({
        textScale: typeof record.textScale === 'number' ? record.textScale : SITE_TEXT_SIZE_SCALES[window.siteTextSize.preference],
        codeWrap: typeof record.codeWrap === 'boolean' ? record.codeWrap : null,
        lineSpacing: record.lineSpacing === 'relaxed' ? 'relaxed' : 'standard'
      }, { persist: false, source: 'storage' });
    });
    new MutationObserver(() => {
      if (contextOverride !== null) return;
      embeddedLesson = root.classList.contains('html-practice-embedded');
      publish('context');
    }).observe(root, { attributes: true, attributeFilter: ['class'] });
    publish('initial');
    const hasStoredPreferences = () => {
      try {
        if (SITE_THEME_OPTIONS.includes(localStorage.getItem(SITE_THEME_STORAGE_KEY)) ||
          SITE_TEXT_SIZE_OPTIONS.includes(localStorage.getItem(SITE_TEXT_SIZE_STORAGE_KEY))) return true;
        const record = readDisplayRecord();
        return (typeof record.textScale === 'number' && Number.isFinite(record.textScale)) ||
          typeof record.codeWrap === 'boolean' || ['standard', 'relaxed'].includes(record.lineSpacing);
      }
      catch { return false; }
    };
    return { version: 1, get state() { return getState(); }, getState, setPreferences, setContext, reset, hasStoredPreferences };
  }

  if (!window.siteDisplaySettings) window.siteDisplaySettings = initializeSiteDisplaySettings();
})();
