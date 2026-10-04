(function (root, factory) {
  'use strict';
  const core = typeof module === 'object' && module.exports
    ? require('./color-palette-core.js')
    : root.ColorPaletteCore;
  const api = factory(core);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ColorPaletteModel = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Core) {
  'use strict';

  if (!Core) throw new Error('ColorPaletteCore が必要です');
  const SCHEMA_VERSION = 2;
  const MAX_CHROMA = 0.37;
  const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
  const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
  const finite = value => typeof value === 'number' && Number.isFinite(value);
  const clampHue = value => ((value % 360) + 360) % 360;
  const clone = value => JSON.parse(JSON.stringify(value));

  function rgbToHsl(red, green, blue) {
    let r = channel(red) / 255, g = channel(green) / 255, b = channel(blue) / 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b), delta = max - min;
    let h = 0, s = 0;
    const l = (max + min) / 2;
    if (delta !== 0) {
      s = delta / (1 - Math.abs(2 * l - 1));
      if (max === r) h = ((g - b) / delta) % 6;
      else if (max === g) h = (b - r) / delta + 2;
      else h = (r - g) / delta + 4;
      h = clampHue(h * 60);
    }
    return { h, s: s * 100, l: l * 100 };
  }

  function rgbToHsv(red, green, blue) {
    const r = channel(red) / 255, g = channel(green) / 255, b = channel(blue) / 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b), delta = max - min;
    let h = 0;
    if (delta !== 0) {
      if (max === r) h = ((g - b) / delta) % 6;
      else if (max === g) h = (b - r) / delta + 2;
      else h = (r - g) / delta + 4;
      h = clampHue(h * 60);
    }
    return { h, s: max === 0 ? 0 : delta / max * 100, v: max * 100 };
  }

  function channel(value) {
    if (!finite(value) || value < 0 || value > 255) throw new RangeError('RGB値は0〜255の有限数にしてください');
    return value;
  }

  function hslToRgb(hue, saturation, lightness) {
    checkComponent(hue, 0, 360, 'HSL H');
    checkComponent(saturation, 0, 100, 'HSL S');
    checkComponent(lightness, 0, 100, 'HSL L');
    const h = clampHue(hue) / 360, s = saturation / 100, l = lightness / 100;
    if (s === 0) {
      const value = Math.round(l * 255);
      return { r: value, g: value, b: value };
    }
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    const hueToRgb = t => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };
    return {
      r: Math.round(hueToRgb(h + 1 / 3) * 255),
      g: Math.round(hueToRgb(h) * 255),
      b: Math.round(hueToRgb(h - 1 / 3) * 255)
    };
  }

  function hsvToRgb(hue, saturation, value) {
    checkComponent(hue, 0, 360, 'HSV H');
    checkComponent(saturation, 0, 100, 'HSV S');
    checkComponent(value, 0, 100, 'HSV V');
    const h = clampHue(hue) / 60, s = saturation / 100, v = value / 100;
    const i = Math.floor(h), f = h - i;
    const p = v * (1 - s), q = v * (1 - f * s), t = v * (1 - (1 - f) * s);
    const choices = [[v,t,p],[q,v,p],[p,v,t],[p,q,v],[t,p,v],[v,p,q]][i % 6];
    return { r: Math.round(choices[0] * 255), g: Math.round(choices[1] * 255), b: Math.round(choices[2] * 255) };
  }

  function parseHex(raw) {
    if (typeof raw !== 'string') return null;
    let hex = raw.trim().replace(/^#/, '');
    if (!/^(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(hex)) return null;
    if (hex.length === 3) hex = hex.split('').map(ch => ch + ch).join('');
    return { r: parseInt(hex.slice(0, 2), 16), g: parseInt(hex.slice(2, 4), 16), b: parseInt(hex.slice(4, 6), 16) };
  }

  function cssIdentifier(raw) {
    const normalized = String(raw == null ? '' : raw).normalize('NFKC').trim().toLowerCase()
      .replace(/[^\p{L}\p{N}_-]+/gu, '-')
      .replace(/^-+|-+$/g, '');
    return normalized || 'color';
  }

  function isCssIdentifier(value) {
    return typeof value === 'string' && value.length > 0 && cssIdentifier(value) === value;
  }

  function checkComponent(value, min, max, label) {
    if (!finite(value) || value < min || value > max) throw new RangeError(`${label}の範囲が不正です`);
    return value;
  }

  function rgbObjectToOklch(rgb) { return Core.rgbToOklch(rgb.r, rgb.g, rgb.b); }
  function mappedRgb(l, c, h) {
    const mapped = Core.mapToSrgb(l, c, h);
    return { r: mapped.r, g: mapped.g, b: mapped.b };
  }
  function hex(rgb) { return `#${Core.rgbToHex(Math.round(rgb.r), Math.round(rgb.g), Math.round(rgb.b))}`; }

  function defaults() {
    const rgb = { r: 34, g: 83, b: 134 };
    const lch = rgbObjectToOklch(rgb), hsl = rgbToHsl(rgb.r, rgb.g, rgb.b), hsv = rgbToHsv(rgb.r, rgb.g, rgb.b);
    return {
      schemaVersion: SCHEMA_VERSION,
      revision: 0,
      state: {
        ...lch, ...rgb,
        count: 16, viewMode: 'fill', bgTheme: 'light', outputFormat: 'oklch', hsvMode: 'hsl',
        hsl, hsv, themeMode: 'auto', comparisonFG: '#225386', comparisonBG: '#FFFFFF', compareFollow: 'fg'
      },
      pinnedColors: [],
      reservedCssNames: []
    };
  }

  function normalizeDocument(raw, options = {}) {
    const strict = options.strict === true;
    if (typeof raw === 'string') {
      try { raw = JSON.parse(raw); }
      catch (error) { throw new TypeError(`JSONを読み込めません: ${error.message}`); }
    }
    if (!isObject(raw)) throw new TypeError('保存データはオブジェクトである必要があります');
    if (strict && raw.schemaVersion !== undefined && raw.schemaVersion !== SCHEMA_VERSION) throw new TypeError('未対応の保存形式です');
    if (strict && (!isObject(raw.state) || !Array.isArray(raw.pinnedColors))) throw new TypeError('読み込みデータのstateまたはpinnedColorsが不正です');
    let repaired = false;
    if (raw.schemaVersion !== SCHEMA_VERSION) repaired = true;
    const document = defaults();
    const inputState = isObject(raw.state) ? raw.state : {};
    if (raw.state !== undefined && !isObject(raw.state)) {
      if (strict) throw new TypeError('stateはオブジェクトである必要があります');
      repaired = true;
    }
    if (raw.state === undefined) repaired = true;

    const colorKeys = ['l', 'c', 'h', 'r', 'g', 'b'];
    const suppliedColorFieldInvalid = colorKeys.some(key => own(inputState, key) && !validStateField(key, inputState[key]));
    if (strict && suppliedColorFieldInvalid) throw new TypeError('色の状態に不正な値があります');
    if (!strict && suppliedColorFieldInvalid) repaired = true;
    const hasLch = ['l', 'c', 'h'].every(key => validStateField(key, inputState[key]));
    const hasRgb = ['r', 'g', 'b'].every(key => validStateField(key, inputState[key]));
    let lch, rgb;
    if (hasLch) {
      lch = { l: inputState.l, c: inputState.c, h: clampHue(inputState.h) };
      rgb = mappedRgb(lch.l, lch.c, lch.h);
    } else if (hasRgb) {
      rgb = { r: inputState.r, g: inputState.g, b: inputState.b };
      lch = rgbObjectToOklch(rgb);
      if (own(inputState, 'l') || own(inputState, 'c') || own(inputState, 'h')) repaired = true;
    } else {
      lch = { l: document.state.l, c: document.state.c, h: document.state.h };
      rgb = { r: document.state.r, g: document.state.g, b: document.state.b };
      if (colorKeys.some(key => own(inputState, key))) repaired = true;
    }
    Object.assign(document.state, lch, rgb);

    for (const [key, allowed] of Object.entries({
      count: value => validRange(value, 3, 36) && Number.isInteger(value),
      viewMode: value => ['fill', 'text'].includes(value),
      bgTheme: value => ['light', 'dark'].includes(value),
      outputFormat: value => ['oklch', 'hex', 'rgb', 'hsl', 'hsv'].includes(value),
      hsvMode: value => ['hsl', 'hsv'].includes(value),
      themeMode: value => ['auto', 'light', 'dark'].includes(value),
      compareFollow: value => ['fg', 'bg', 'none'].includes(value)
    })) {
      if (own(inputState, key)) {
        if (allowed(inputState[key])) document.state[key] = inputState[key];
        else if (strict) throw new TypeError(`state.${key}が不正です`);
        else repaired = true;
      }
    }
    for (const key of ['comparisonFG', 'comparisonBG']) {
      if (own(inputState, key)) {
        const parsed = typeof inputState[key] === 'string' ? parseHex(inputState[key]) : null;
        if (parsed) document.state[key] = hex(parsed);
        else if (strict) throw new TypeError(`state.${key}が不正です`);
        else repaired = true;
      }
    }
    if (document.state.compareFollow === 'fg' && document.state.comparisonFG !== hex(rgb)) {
      document.state.comparisonFG = hex(rgb);
      repaired = true;
    }
    if (document.state.compareFollow === 'bg' && document.state.comparisonBG !== hex(rgb)) {
      document.state.comparisonBG = hex(rgb);
      repaired = true;
    }

    const displayedRgb = mappedRgb(document.state.l, document.state.c, document.state.h);
    const derivedHsl = rgbToHsl(displayedRgb.r, displayedRgb.g, displayedRgb.b);
    const derivedHsv = rgbToHsv(displayedRgb.r, displayedRgb.g, displayedRgb.b);
    for (const [key, derived, ranges] of [
      ['hsl', derivedHsl, { h: [0, 360], s: [0, 100], l: [0, 100] }],
      ['hsv', derivedHsv, { h: [0, 360], s: [0, 100], v: [0, 100] }]
    ]) {
      const provided = inputState[key];
      if (provided !== undefined && !isObject(provided)) {
        if (strict) throw new TypeError(`state.${key}はオブジェクトである必要があります`);
        repaired = true;
      }
      const result = { ...derived };
      if (isObject(provided)) {
        for (const component of Object.keys(ranges)) {
          if (!own(provided, component)) continue;
          const [min, max] = ranges[component];
          if (validRange(provided[component], min, max)) result[component] = provided[component];
          else if (strict) throw new TypeError(`state.${key}.${component}が不正です`);
          else repaired = true;
        }
      }
      const neutral = key === 'hsl' ? derived.s < 1e-10 : derived.s < 1e-10;
      const powerless = key === 'hsl' ? derived.l <= 0 || derived.l >= 100 : derived.v <= 0;
      if (!isObject(provided)) {
        if (neutral && validRange(inputState[key]?.h, 0, 360)) result.h = inputState[key].h;
        if (powerless && validRange(inputState[key]?.s, 0, 100)) result.s = inputState[key].s;
      }
      document.state[key] = result;
    }

    const rawPins = raw.pinnedColors;
    if (rawPins !== undefined && !Array.isArray(rawPins)) {
      if (strict) throw new TypeError('pinnedColorsは配列である必要があります');
      repaired = true;
    }
    if (strict && rawPins === undefined) throw new TypeError('pinnedColorsがありません');
    if (!strict && rawPins === undefined) repaired = true;
    const reservedInput = raw.reservedCssNames;
    if (reservedInput !== undefined && !Array.isArray(reservedInput)) {
      if (strict) throw new TypeError('reservedCssNamesは配列である必要があります');
      repaired = true;
    }
    const reserved = new Set();
    if (Array.isArray(reservedInput)) {
      for (const name of reservedInput) {
        if (isCssIdentifier(name)) reserved.add(name);
        else if (strict) throw new TypeError('予約済みCSS名が不正です');
        else repaired = true;
      }
    }
    document.revision = validRange(raw.revision, 0, Number.MAX_SAFE_INTEGER) && Number.isInteger(raw.revision) ? raw.revision : 0;
    if (raw.revision !== undefined && document.revision !== raw.revision) {
      if (strict) throw new TypeError('revisionが不正です');
      repaired = true;
    }

    const pins = Array.isArray(rawPins) ? rawPins : [];
    const prepared = [];
    const usedIds = new Set();
    const existingAliases = new Set();
    for (let index = 0; index < pins.length; index += 1) {
      const source = pins[index];
      const validColor = isObject(source)
        && validRange(source.l, 0, 1) && validRange(source.c, 0, MAX_CHROMA) && finite(source.h);
      const validId = source && source.id === undefined || (source && typeof source.id === 'string' && source.id.length > 0 && !usedIds.has(source.id));
      const validName = source && (source.name === undefined || typeof source.name === 'string');
      const validAlias = source && (source.cssName === undefined || isCssIdentifier(source.cssName));
      if (!validColor || !validId || !validName || !validAlias) {
        if (strict) throw new TypeError(`pinnedColors[${index}]が不正です`);
        repaired = true;
        continue;
      }
      const id = source.id === undefined ? legacyId(index, usedIds) : source.id;
      if (source.id === undefined || source.cssName === undefined || source.name === undefined) repaired = true;
      if (usedIds.has(id)) {
        if (strict) throw new TypeError(`pinnedColors[${index}].idが重複しています`);
        repaired = true;
        continue;
      }
      usedIds.add(id);
      const baseName = typeof source.name === 'string' ? source.name : 'color';
      const pin = { id, l: source.l, c: source.c, h: clampHue(source.h), name: baseName };
      if (source.cssName !== undefined) {
        if (existingAliases.has(source.cssName)) {
          if (strict) throw new TypeError(`pinnedColors[${index}].cssNameが重複しています`);
          repaired = true;
          pin.cssName = allocateCssName(cssIdentifier(baseName), reserved, existingAliases);
        } else {
          pin.cssName = source.cssName;
          existingAliases.add(pin.cssName);
          reserved.add(pin.cssName);
        }
      } else {
        pin.cssName = null;
      }
      prepared.push({ index, pin });
    }
    // 旧データの既定エイリアスは、以前のCSS出力と同じ衝突解消を使う。
    const legacyNames = oldStockCssNames(prepared.map(entry => entry.pin.name));
    for (let i = 0; i < prepared.length; i += 1) {
      const pin = prepared[i].pin;
      if (pin.cssName !== null) continue;
      let candidate = legacyNames[i];
      if (existingAliases.has(candidate)) candidate = allocateCssName(candidate, reserved, existingAliases);
      pin.cssName = candidate;
      existingAliases.add(candidate);
      reserved.add(candidate);
    }
    document.pinnedColors = prepared.map(entry => entry.pin);
    document.reservedCssNames = [...reserved];
    return { document, repaired };
  }

  function validRange(value, min, max) { return finite(value) && value >= min && value <= max; }
  function validStateField(key, value) {
    if (key === 'l') return validRange(value, 0, 1);
    if (key === 'c') return validRange(value, 0, MAX_CHROMA);
    if (key === 'h') return finite(value);
    return validRange(value, 0, 255) && Number.isInteger(value);
  }
  function legacyId(index, used) {
    let id = `legacy-${index + 1}`, suffix = 2;
    while (used.has(id)) id = `legacy-${index + 1}-${suffix++}`;
    return id;
  }
  function oldStockCssNames(names) {
    const bases = names.map(name => cssIdentifier(name));
    const reserved = new Set(bases), used = new Set();
    return bases.map(base => {
      let name = base, suffix = 2;
      while (used.has(name)) {
        do { name = `${base}-${suffix++}`; } while (reserved.has(name) || used.has(name));
      }
      used.add(name);
      return name;
    });
  }
  function allocateCssName(base, reserved, current) {
    const taken = new Set([...reserved, ...current]);
    if (!taken.has(base)) return base;
    let suffix = 2;
    while (taken.has(`${base}-${suffix}`)) suffix += 1;
    return `${base}-${suffix}`;
  }

  function colorPatch(state, source, values) {
    if (!isObject(state) || !isObject(values)) throw new TypeError('stateとvaluesが必要です');
    const next = clone(state);
    let rgb, lch, hsl, hsv;
    if (source === 'rgb') {
      rgb = { r: own(values, 'r') ? values.r : state.r, g: own(values, 'g') ? values.g : state.g, b: own(values, 'b') ? values.b : state.b };
      for (const key of ['r','g','b']) if (!validStateField(key, rgb[key])) throw new RangeError(`RGB ${key}が不正です`);
      lch = rgbObjectToOklch(rgb);
      hsl = deriveHsl(rgb, state.hsl);
      hsv = deriveHsv(rgb, state.hsv);
    } else if (source === 'oklch') {
      lch = {
        l: own(values, 'l') ? values.l : state.l,
        c: own(values, 'c') ? values.c : state.c,
        h: own(values, 'h') ? values.h : state.h
      };
      if (!validRange(lch.l, 0, 1) || !validRange(lch.c, 0, MAX_CHROMA) || !finite(lch.h)) throw new RangeError('OKLCH値が不正です');
      lch.h = clampHue(lch.h);
      rgb = mappedRgb(lch.l, lch.c, lch.h);
      hsl = deriveHsl(rgb, state.hsl);
      hsv = deriveHsv(rgb, state.hsv);
    } else if (source === 'hsl' || source === 'hsv') {
      const key = source;
      const components = source === 'hsl' ? ['h','s','l'] : ['h','s','v'];
      const previous = isObject(state[key]) ? state[key] : (source === 'hsl' ? rgbToHsl(state.r,state.g,state.b) : rgbToHsv(state.r,state.g,state.b));
      const edited = {};
      for (const component of components) {
        edited[component] = own(values, component) ? values[component] : previous[component];
        checkComponent(edited[component], 0, component === 'h' ? 360 : 100, `${source.toUpperCase()} ${component.toUpperCase()}`);
      }
      rgb = source === 'hsl' ? hslToRgb(edited.h, edited.s, edited.l) : hsvToRgb(edited.h, edited.s, edited.v);
      lch = rgbObjectToOklch(rgb);
      hsl = source === 'hsl' ? edited : deriveHsl(rgb, state.hsl);
      hsv = source === 'hsv' ? edited : deriveHsv(rgb, state.hsv);
      if (rgb.r === rgb.g && rgb.g === rgb.b) {
        if (source === 'hsl') hsv.h = edited.h;
        else hsl.h = edited.h;
      }
    } else throw new TypeError(`未対応の色入力: ${source}`);

    Object.assign(next, lch, rgb, { hsl, hsv });
    if (next.compareFollow === 'fg') next.comparisonFG = hex(rgb);
    else if (next.compareFollow === 'bg') next.comparisonBG = hex(rgb);
    const patch = {};
    for (const key of ['l','c','h','r','g','b','hsl','hsv']) patch[key] = clone(next[key]);
    if (next.compareFollow === 'fg') patch.comparisonFG = next.comparisonFG;
    else if (next.compareFollow === 'bg') patch.comparisonBG = next.comparisonBG;
    return patch;
  }

  function deriveHsl(rgb, previous) {
    const result = rgbToHsl(rgb.r, rgb.g, rgb.b);
    if (result.s < 1e-10) result.h = previous?.h ?? result.h;
    if (result.l <= 0 || result.l >= 100) result.s = previous?.s ?? result.s;
    return result;
  }
  function deriveHsv(rgb, previous) {
    const result = rgbToHsv(rgb.r, rgb.g, rgb.b);
    if (result.s < 1e-10) result.h = previous?.h ?? result.h;
    if (result.v <= 0) result.s = previous?.s ?? result.s;
    return result;
  }

  function applyCommand(inputDocument, command) {
    if (!isObject(inputDocument) || !isObject(command) || typeof command.type !== 'string') throw new TypeError('documentとcommandが必要です');
    const current = normalizeDocument(inputDocument, { strict: true }).document;
    const before = clone(current);
    let next = clone(current), inverse = null;
    switch (command.type) {
      case 'state': {
        if (!isObject(command.patch)) throw new TypeError('state patchが必要です');
        if (command.expected !== undefined) assertExpectedSubset(current.state, command.expected, 'stateが別の場所で変更されています');
        const allowed = new Set(['l','c','h','r','g','b','hsl','hsv','count','viewMode','bgTheme','outputFormat','hsvMode','themeMode','comparisonFG','comparisonBG','compareFollow']);
        for (const [key, value] of Object.entries(command.patch)) if (!allowed.has(key)) throw new TypeError(`変更できないstate項目です: ${key}`);
        const normalized = normalizeDocument({ ...next, state: { ...next.state, ...command.patch } }, { strict: true }).document.state;
        next.state = normalized;
        const expected = {};
        const undoPatch = {};
        for (const key of Object.keys(command.patch)) {
          undoPatch[key] = clone(before.state[key]);
          expected[key] = clone(next.state[key]);
        }
        inverse = { type: 'state', patch: undoPatch, expected };
        break;
      }
      case 'addStock': {
        if (!isObject(command.color)) throw new TypeError('追加する色が必要です');
        const color = normalizePin(command.color, next, command.expectedAbsent === true);
        if (command.expectedAbsent !== true && next.pinnedColors.some(pin => Math.abs(pin.l - color.l) < 0.0001
          && Math.abs(pin.c - color.c) < 0.0001 && hueDistance(pin.h, color.h) < 0.05)) {
          throw new Error('同じLCH色はすでにストックされています');
        }
        const index = command.index === undefined ? next.pinnedColors.length : command.index;
        if (!Number.isInteger(index) || index < 0 || index > next.pinnedColors.length) throw new RangeError('ストック位置が不正です');
        next.pinnedColors.splice(index, 0, color);
        if (!next.reservedCssNames.includes(color.cssName)) next.reservedCssNames.push(color.cssName);
        inverse = { type: 'removeStock', id: color.id, expected: color };
        break;
      }
      case 'removeStock': {
        const index = next.pinnedColors.findIndex(pin => pin.id === command.id);
        if (index < 0) throw new Error('削除対象のストックがありません');
        const old = next.pinnedColors[index];
        if (command.expected !== undefined && !sameValue(old, command.expected)) throw new Error('ストックが別の場所で変更されています');
        next.pinnedColors.splice(index, 1);
        inverse = { type: 'addStock', color: old, index, expectedAbsent: true };
        break;
      }
      case 'renameStock': {
        const pin = requirePin(next, command.id);
        if (command.expected !== undefined && pin.name !== command.expected) throw new Error('ストック名が別の場所で変更されています');
        if (typeof command.name !== 'string') throw new TypeError('ストック名は文字列にしてください');
        const old = pin.name;
        pin.name = command.name;
        inverse = { type: 'renameStock', id: pin.id, name: old, expected: command.name };
        break;
      }
      case 'setCssName': {
        const pin = requirePin(next, command.id);
        if (command.expected !== undefined && pin.cssName !== command.expected) throw new Error('CSS名が別の場所で変更されています');
        if (typeof command.cssName !== 'string') throw new TypeError('CSS名は文字列にしてください');
        const newName = cssIdentifier(command.cssName);
        const conflict = next.pinnedColors.some(other => other.id !== pin.id && other.cssName === newName);
        if (conflict) throw new Error('CSS名は使用中です');
        const old = pin.cssName;
        pin.cssName = newName;
        if (!next.reservedCssNames.includes(newName)) next.reservedCssNames.push(newName);
        inverse = { type: 'setCssName', id: pin.id, cssName: old, expected: newName };
        break;
      }
      case 'replace': {
        if (command.expectedRevision !== undefined && current.revision !== command.expectedRevision) throw new Error('保存データが別の場所で変更されています');
        const replacement = normalizeDocument(command.document, { strict: true }).document;
        next = replacement;
        inverse = { type: 'replace', document: before, expectedRevision: current.revision + 1 };
        break;
      }
      default: throw new TypeError(`未対応のcommand: ${command.type}`);
    }
    const changed = !sameValue(withoutRevision(before), withoutRevision(next));
    if (!changed) return { document: current, inverse: null, changed: false };
    next.revision = current.revision + 1;
    if (command.type === 'replace') inverse.expectedRevision = next.revision;
    return { document: next, inverse, changed: true };
  }

  function normalizePin(source, document, expectedAbsent) {
    if (!validRange(source.l, 0, 1) || !validRange(source.c, 0, MAX_CHROMA) || !finite(source.h)) throw new TypeError('ストック色のLCHが不正です');
    const id = source.id === undefined ? nextPinId(document) : source.id;
    if (typeof id !== 'string' || !id.length) throw new TypeError('ストックIDが不正です');
    if (document.pinnedColors.some(pin => pin.id === id)) {
      if (expectedAbsent) throw new Error('同じIDのストックがすでにあります');
      throw new Error('ストックIDが重複しています');
    }
    const name = source.name === undefined ? 'color' : source.name;
    if (typeof name !== 'string') throw new TypeError('ストック名が不正です');
    let cssName;
    if (source.cssName === undefined) cssName = allocateCssName(cssIdentifier(name), new Set(document.reservedCssNames), new Set(document.pinnedColors.map(pin => pin.cssName)));
    else {
      if (typeof source.cssName !== 'string') throw new TypeError('CSS名が不正です');
      cssName = cssIdentifier(source.cssName);
      if (document.reservedCssNames.includes(cssName) && !expectedAbsent) throw new Error('CSS名は使用中または予約済みです');
    }
    if (document.pinnedColors.some(pin => pin.cssName === cssName)) throw new Error('CSS名が重複しています');
    return { id, l: source.l, c: source.c, h: clampHue(source.h), name, cssName };
  }
  function nextPinId(document) {
    let index = document.revision + 1, id = `stock-${index}`;
    const existing = new Set(document.pinnedColors.map(pin => pin.id));
    while (existing.has(id)) id = `stock-${++index}`;
    return id;
  }
  function hueDistance(left, right) {
    const distance = Math.abs(clampHue(left) - clampHue(right));
    return Math.min(distance, 360 - distance);
  }
  function requirePin(document, id) {
    const pin = document.pinnedColors.find(item => item.id === id);
    if (!pin) throw new Error('対象のストックがありません');
    return pin;
  }
  function assertExpectedSubset(object, expected, message) {
    if (!isObject(expected)) throw new TypeError('expectedはオブジェクトにしてください');
    for (const [key, value] of Object.entries(expected)) if (!sameValue(object[key], value)) throw new Error(message);
  }
  function withoutRevision(document) {
    const copy = clone(document);
    delete copy.revision;
    return copy;
  }
  function sameValue(left, right) {
    if (left === right) return true;
    if (typeof left !== typeof right || left === null || right === null || typeof left !== 'object') return false;
    if (Array.isArray(left) !== Array.isArray(right)) return false;
    const leftKeys = Object.keys(left).sort(), rightKeys = Object.keys(right).sort();
    if (leftKeys.length !== rightKeys.length || leftKeys.some((key, index) => key !== rightKeys[index])) return false;
    return leftKeys.every(key => sameValue(left[key], right[key]));
  }

  function relativeLuminance(rgb) {
    if (!isObject(rgb)) throw new TypeError('RGBオブジェクトが必要です');
    const linear = value => {
      const channelValue = channel(value) / 255;
      return channelValue <= 0.04045 ? channelValue / 12.92 : ((channelValue + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * linear(rgb.r) + 0.7152 * linear(rgb.g) + 0.0722 * linear(rgb.b);
  }
  function contrastRatio(foreground, background) {
    const a = relativeLuminance(foreground), b = relativeLuminance(background);
    return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  }

  return Object.freeze({
    defaults, normalizeDocument, colorPatch, applyCommand,
    rgbToHsl, rgbToHsv, hslToRgb, hsvToRgb, parseHex, cssIdentifier,
    relativeLuminance, contrastRatio
  });
});
